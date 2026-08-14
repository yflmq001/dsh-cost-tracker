/**
 * The `cost` session projection: folds durable provider usage into cost.
 *
 * Pure synchronous fold; prices only the finalized `assistant/message.usage`
 * (never the early `assistant/chunk` usage sample) so a call is never counted
 * twice. The model id is taken from the latest preceding `request/header`.
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { CostBreakdown, CostTrackerConfig, ModelCostDetail, SessionCostProjection } from './types.ts'
import { priceUsage } from './pricing.ts'
import type {} from './projection.ts'

interface CostState {
  totals: SessionCostProjection
  currentModel: string | undefined
  lastSample: { turn: number; step: number } | undefined
}

const zeroProjection = (): SessionCostProjection => ({
  totalCost: 0,
  peakCost: 0,
  offpeakCost: 0,
  callCount: 0,
  unconfiguredCalls: 0,
  unconfiguredModels: [],
  byModel: {},
})

/** Fold one call's bucket costs into a per-model detail (cache write bills at the miss tier). */
function addModelDetail(prev: ModelCostDetail | undefined, b: CostBreakdown): ModelCostDetail {
  const inputMiss = b.inputMissCost + b.cacheWriteCost
  return {
    inputHit: (prev?.inputHit ?? 0) + b.inputHitCost,
    inputMiss: (prev?.inputMiss ?? 0) + inputMiss,
    output: (prev?.output ?? 0) + b.outputCost,
    total: (prev?.total ?? 0) + b.cost,
  }
}

const modelCostDetailSchema = z.object({
  inputHit: z.number(),
  inputMiss: z.number(),
  output: z.number(),
  total: z.number(),
})

const costSchema = z.object({
  totalCost: z.number(),
  peakCost: z.number(),
  offpeakCost: z.number(),
  callCount: z.number().int().nonnegative(),
  unconfiguredCalls: z.number().int().nonnegative(),
  unconfiguredModels: z.array(z.string()),
  byModel: z.record(z.string(), modelCostDetailSchema),
}).strict()

export const costProjectionDefinition = (
  config: CostTrackerConfig,
): ProjectionDefinition<'cost', CostState> => ({
  key: 'cost',
  schema: costSchema,
  init: () => ({ totals: zeroProjection(), currentModel: undefined, lastSample: undefined }),
  apply: (state, event: SessionEvent) => {
    let next = state

    if (event.type === 'request/header') {
      next = { ...next, currentModel: event.data.header.config.model }
    }

    if (event.type === 'assistant/message' && event.data.usage !== undefined) {
      const { turn, step, usage } = event.data
      // Same turn/step already finalized: do not double-count.
      if (state.lastSample !== undefined
        && state.lastSample.turn === turn
        && state.lastSample.step === step) {
        return next
      }
      const model = next.currentModel
      if (model === undefined) {
        // No known model: count the call but price nothing.
        next = {
          ...next,
          lastSample: { turn, step },
          totals: { ...next.totals, callCount: next.totals.callCount + 1 },
        }
        return next
      }

      const result = priceUsage(usage, model, config.models, event.time)
      if (result.status === 'configured') {
        const b = result.breakdown
        next = {
          ...next,
          lastSample: { turn, step },
          totals: {
            totalCost: next.totals.totalCost + b.cost,
            peakCost: next.totals.peakCost + (b.isPeak ? b.cost : 0),
            offpeakCost: next.totals.offpeakCost + (b.isPeak ? 0 : b.cost),
            callCount: next.totals.callCount + 1,
            unconfiguredCalls: next.totals.unconfiguredCalls,
            unconfiguredModels: next.totals.unconfiguredModels,
            byModel: { ...next.totals.byModel, [model]: addModelDetail(next.totals.byModel[model], b) },
          },
        }
      } else {
        next = {
          ...next,
          lastSample: { turn, step },
          totals: {
            ...next.totals,
            callCount: next.totals.callCount + 1,
            unconfiguredCalls: next.totals.unconfiguredCalls + 1,
            unconfiguredModels: next.totals.unconfiguredModels.includes(model)
              ? next.totals.unconfiguredModels
              : [...next.totals.unconfiguredModels, model],
          },
        }
      }
    }

    return next
  },
  view: state => state.totals,
  stateVersion: 1,
})
