/**
 * Host-side `/cost` command: reports the token cost of the current workspace
 * (or, for workspace-less sessions, the current session), broken out by model
 * with per-bucket amounts.
 *
 * Exported as a plain helper and wired into the {@link CostTracker} service
 * (the package's single loader entry), not as a standalone function plugin —
 * the Loader resolves only `lib/index.js` for this package.
 *
 * @module dsh-cost-tracker/command
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { Session } from '@deepseek-ai/dsh-session'
import type { CostAggregate } from './types.ts'

const SESSION_PREFIX = 'session:'

/** Append one aggregate's per-model bucket lines. */
function appendModels(lines: string[], agg: CostAggregate): void {
  for (const [model, d] of Object.entries(agg.byModel)) {
    lines.push(
      `  ${model}  命中 ¥${d.inputHit.toFixed(4)}  未命中 ¥${d.inputMiss.toFixed(4)}  输出 ¥${d.output.toFixed(4)}  合计 ¥${d.total.toFixed(4)}`,
    )
  }
  if (agg.unconfiguredModels.length > 0) {
    lines.push(`  ⚠️ 未配置价格: ${agg.unconfiguredModels.join(', ')}（请补充价格配置）`)
  }
}

/** Render one workspace (or session) aggregate as the `/cost` command body. */
export function formatScope(key: string, agg: CostAggregate): string {
  const lines: string[] = []
  const label = key.startsWith(SESSION_PREFIX)
    ? `会话 ${key.slice(SESSION_PREFIX.length)}`
    : `工作区 ${key}`
  lines.push(`${label}（合计 ¥${agg.totalCost.toFixed(4)}，调用 ${agg.callCount} 次）`)
  appendModels(lines, agg)
  lines.push('────────────────')
  lines.push(
    `总计 ¥${agg.totalCost.toFixed(4)}  高峰 ¥${agg.peakCost.toFixed(4)} / 空闲 ¥${agg.offpeakCost.toFixed(4)}  调用 ${agg.callCount} 次`,
  )
  return lines.join('\n')
}

/** Resolve the receiving session to its workspace aggregate. */
export type ScopeResolver = (session: Session) => { key: string; aggregate: CostAggregate }

/**
 * Register the `/cost` command on a context whose `commands` service is ready.
 * The aggregate is resolved per invocation from the receiving agent's session,
 * so the report always scopes to the current workspace (never the global bill).
 * @param ctx - context carrying the `commands` service.
 * @param resolve - maps the receiving session to its scope label + aggregate.
 */
export function registerCostCommand(ctx: Context, resolve: ScopeResolver): void {
  ctx.effect(() => ctx.commands.register({
    name: 'cost',
    description: 'Show token cost for the current workspace',
    handler: async (invocation): Promise<CommandResult> => {
      const { key, aggregate } = resolve(invocation.agent.session)
      return { kind: 'success', text: formatScope(key, aggregate) }
    },
  }), 'cost-tracker: command')
}
