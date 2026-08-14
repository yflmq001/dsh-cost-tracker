/**
 * Cross-session global bill aggregation.
 *
 * Pure folds kept free of Cordis imports so they unit-test in isolation.
 * The service feeds them the per-session `cost` projection deltas from the
 * projection change feed, bucketed into per-workspace aggregates.
 */

import { z } from 'zod'
import type { CostAggregate, ModelCostDetail } from './types.ts'

/** A cross-session running total plus its per-workspace breakdown. */
export interface GlobalBill extends CostAggregate {
  /** Workspace (or `session:<id>` for workspace-less sessions) → aggregate. */
  byWorkspace: Record<string, CostAggregate>
}

const modelCostDetailSchema = z.object({
  inputHit: z.number(),
  inputMiss: z.number(),
  output: z.number(),
  total: z.number(),
})

const aggregateSchema = z.object({
  totalCost: z.number(),
  peakCost: z.number(),
  offpeakCost: z.number(),
  callCount: z.number().int().nonnegative(),
  unconfiguredCalls: z.number().int().nonnegative(),
  unconfiguredModels: z.array(z.string()),
  byModel: z.record(z.string(), modelCostDetailSchema),
})

/** Durable-boundary schema for the global bill (persisted via storage domain). */
export const globalBillSchema = aggregateSchema.extend({
  byWorkspace: z.record(z.string(), aggregateSchema),
})

export const zeroModelDetail = (): ModelCostDetail => ({ inputHit: 0, inputMiss: 0, output: 0, total: 0 })

export const zeroAggregate = (): CostAggregate => ({
  totalCost: 0,
  peakCost: 0,
  offpeakCost: 0,
  callCount: 0,
  unconfiguredCalls: 0,
  unconfiguredModels: [],
  byModel: {},
})

export const zeroBill = (): GlobalBill => ({ ...zeroAggregate(), byWorkspace: {} })

/** Add one delta aggregate into an accumulator. */
export function mergeAggregate(acc: CostAggregate, delta: CostAggregate): CostAggregate {
  const byModel = { ...acc.byModel }
  for (const [model, d] of Object.entries(delta.byModel)) {
    const p = byModel[model] ?? zeroModelDetail()
    byModel[model] = {
      inputHit: p.inputHit + d.inputHit,
      inputMiss: p.inputMiss + d.inputMiss,
      output: p.output + d.output,
      total: p.total + d.total,
    }
  }
  return {
    totalCost: acc.totalCost + delta.totalCost,
    peakCost: acc.peakCost + delta.peakCost,
    offpeakCost: acc.offpeakCost + delta.offpeakCost,
    callCount: acc.callCount + delta.callCount,
    unconfiguredCalls: acc.unconfiguredCalls + delta.unconfiguredCalls,
    unconfiguredModels: [...new Set([...acc.unconfiguredModels, ...delta.unconfiguredModels])],
    byModel,
  }
}

/**
 * Signed difference `cur - prev` for two cumulative snapshots of one session.
 * Per-model deltas keep only positive `total` (a model's cost can only grow);
 * `unconfiguredModels` is the current cumulative set.
 */
export function diffAggregate(prev: CostAggregate, cur: CostAggregate): CostAggregate {
  const byModel: Record<string, ModelCostDetail> = {}
  for (const model of new Set([...Object.keys(prev.byModel), ...Object.keys(cur.byModel)])) {
    const p = prev.byModel[model] ?? zeroModelDetail()
    const c = cur.byModel[model] ?? zeroModelDetail()
    const d = {
      inputHit: c.inputHit - p.inputHit,
      inputMiss: c.inputMiss - p.inputMiss,
      output: c.output - p.output,
      total: c.total - p.total,
    }
    if (d.total > 0) byModel[model] = d
  }
  return {
    totalCost: cur.totalCost - prev.totalCost,
    peakCost: cur.peakCost - prev.peakCost,
    offpeakCost: cur.offpeakCost - prev.offpeakCost,
    callCount: cur.callCount - prev.callCount,
    unconfiguredCalls: cur.unconfiguredCalls - prev.unconfiguredCalls,
    unconfiguredModels: cur.unconfiguredModels,
    byModel,
  }
}

/**
 * Fold one session's delta into the global bill, bucketing it under
 * `workspaceKey` (the session `cwd`, or a `session:<id>` fallback) when known.
 */
export function mergeBill(acc: GlobalBill, delta: CostAggregate, workspaceKey: string | undefined): GlobalBill {
  const base = mergeAggregate(acc, delta)
  if (workspaceKey === undefined) return { ...base, byWorkspace: acc.byWorkspace }
  const byWorkspace = { ...acc.byWorkspace }
  byWorkspace[workspaceKey] = mergeAggregate(byWorkspace[workspaceKey] ?? zeroAggregate(), delta)
  return { ...base, byWorkspace }
}

/** Merge a full global bill into another (used to rehydrate over the durable base). */
export function mergeGlobalBill(acc: GlobalBill, delta: GlobalBill): GlobalBill {
  const base = mergeAggregate(acc, delta)
  const byWorkspace = { ...acc.byWorkspace }
  for (const [key, ws] of Object.entries(delta.byWorkspace)) {
    byWorkspace[key] = mergeAggregate(byWorkspace[key] ?? zeroAggregate(), ws)
  }
  return { ...base, byWorkspace }
}
