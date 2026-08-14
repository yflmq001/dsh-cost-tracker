/**
 * Cost-tracking service: registers the `cost` session projection, maintains a
 * cross-session global bill, and persists the bill through the storage domain.
 *
 * @module dsh-cost-tracker
 */

import { basename } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Session } from '@deepseek-ai/dsh-session'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { CostAggregate, CostTrackerConfig } from './types.ts'
import { costProjectionDefinition } from './cost-projection.ts'
import { costDomainSpec } from './cost-domain.ts'
import { registerCostCommand } from './command.ts'
import { diffAggregate, mergeBill, mergeGlobalBill, zeroAggregate, zeroBill, type GlobalBill } from './billing.ts'
import type {} from './projection.ts'

export type * from './types.ts'

export interface Config extends CostTrackerConfig {}

/** Schemastery schema for the pricing table; unlisted models show a "configure" placeholder. */
const optionalNumber = z.union([z.number(), undefined])
const optionalBoolean = z.union([z.boolean(), undefined])

const configSchema = z.object({
  models: z.dict(z.object({
    inputMiss: z.number(),
    inputHit: optionalNumber,
    output: z.number(),
    peak: z.union([z.object({
      hours: z.array(z.string()),
      enabled: optionalBoolean,
      inputMiss: z.number(),
      inputHit: optionalNumber,
      output: z.number(),
    }), undefined]),
  })).default({}),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    costTracker: CostTracker
  }
}

/** Replay-aware per-session cost service backed by the `cost` projection. */
export class CostTracker extends Service {
  static Config: z<Config> = configSchema as unknown as z<Config>

  /** Cross-session running total, fed by the projection change feed. */
  private _bill: GlobalBill = zeroBill()
  /** Last cumulative `cost` value per session, to diff against the change feed. */
  private readonly sessionTotals = new WeakMap<Session, CostAggregate>()
  /** Opened storage domain, when a storage backend is present. */
  private domain: Domain<typeof costDomainSpec> | undefined
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  /** Optional workspace registry, for grouping the bill by dsh workspace title. */
  private workspaceRegistry: WorkspaceRegistry | undefined

  constructor(ctx: Context, config: Config = { models: {} }) {
    super(ctx, 'costTracker')

    // Projection registration is an optional child: compositions without the
    // generic registry keep the pricing table usable standalone.
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register(costProjectionDefinition(config))
      projectionCtx.sessionProjections.onChanged((session, key, value) => {
        if (key !== 'cost') return
        const cur = value as CostAggregate
        const prev = this.sessionTotals.get(session)
        const delta = prev === undefined ? cur : diffAggregate(prev, cur)
        this.sessionTotals.set(session, cur)
        this._bill = mergeBill(this._bill, delta, this.workspaceKey(session))
        this.schedulePersist()
      })
    })

    // Optional durable persistence: absent a storage backend, stay in-memory.
    // The open is async, so any deltas that land before it completes are
    // preserved by merging (never overwriting) the stored bill.
    ctx.inject(['storageDomain'], (storageCtx) => {
      void storageCtx.storageDomain.open(costDomainSpec).then((domain) => {
        this.domain = domain
        // Release the domain name on unmount so a hot reload can reopen it;
        // without this, an edit to cordis.patch.yml re-runs the inject while
        // the old domain is still reserved and open() throws `already-open`.
        ctx.effect(() => () => domain.close().catch(() => {}), 'cost-tracker: domain close')
        const stored = domain.global.get()
        if (stored !== undefined) {
          this._bill = mergeGlobalBill(stored, this._bill)
        }
      }).catch((error) => {
        ctx.logger.warn(`cost-tracker: storage domain open failed: ${String(error)}`)
      })
    })

    // Optional workspace grouping: prefer the dsh workspace title for a session,
    // falling back to the cwd basename (or a per-session bucket) when absent.
    ctx.inject(['workspaceRegistry'], (wsCtx) => {
      this.workspaceRegistry = wsCtx.workspaceRegistry
    })

    // Clear the debounce timer on unload so a shutdown never fires a write
    // into an already-closed domain (the open is async, so the timer may still
    // be pending when the storage facility tears the domain down).
    ctx.effect(() => () => {
      if (this.persistTimer !== undefined) {
        clearTimeout(this.persistTimer)
        this.persistTimer = undefined
      }
    }, 'cost-tracker: persist timer')

    // `/cost` command: the `commands` service is in dsh-base, so this is an
    // optional child only for the unusual composition without a command layer.
    ctx.inject(['commands'], (cmdCtx) => {
      registerCostCommand(cmdCtx, (session) => {
        const key = this.workspaceKey(session)
        return { key, aggregate: this._bill.byWorkspace[key] ?? zeroAggregate() }
      })
    })
  }

  /** Current cross-session bill. */
  get bill(): GlobalBill {
    return this._bill
  }

  /** Resolve a session to its grouping key: workspace title, cwd basename, or per-session id. */
  private workspaceKey(session: Session): string {
    const reg = this.workspaceRegistry
    if (reg !== undefined) {
      try {
        for (const ws of reg.list()) {
          if (ws.sessionIds.includes(session.id)) return ws.title
        }
      } catch {
        // Registry not ready yet; fall through to the cwd basename.
      }
    }
    const cwd = session.header.cwd
    if (cwd !== undefined && cwd !== '') return basename(cwd)
    return `session:${session.id}`
  }

  /** Debounce a durable write after a change-feed delta. */
  private schedulePersist(): void {
    if (this.persistTimer !== undefined) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined
      if (this.domain !== undefined) {
        // Best-effort durable write: a shutdown may close the domain before
        // this debounced flush fires, in which case the rejection is expected
        // and harmless (the bill already persists on the next delta).
        void this.domain.global.set(this._bill).catch(() => {})
      }
    }, 1000)
  }
}

export default CostTracker
