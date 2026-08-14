/**
 * Public configuration and cost vocabulary for token cost tracking.
 *
 * @module dsh-cost-tracker/types
 */

import type { TokenUsage } from '@deepseek-ai/dsh-llm'

/** Per-model peak pricing: hours + optional toggle + the three price tiers. */
export interface PeakPricing {
  /** Peak windows in Beijing time, e.g. `["09:00-12:00", "14:00-18:00"]`. */
  readonly hours: readonly string[]
  /** Toggle the peak tier: `false` disables it (base rates always apply); omit or `true` enables it. */
  readonly enabled?: boolean
  /** Peak uncached input price (cache miss). */
  readonly inputMiss: number
  /** Peak cached-input price (cache hit). Omit to reuse `inputMiss`. */
  readonly inputHit?: number
  /** Peak output price. */
  readonly output: number
}

/** Per-model pricing, in currency units per million tokens. */
export interface ModelPricing {
  /** Uncached input price (cache miss). */
  readonly inputMiss: number
  /** Cached input price (cache hit). Omit for providers without a cache tier. */
  readonly inputHit?: number
  /** Output price. */
  readonly output: number
  /** Peak tier: hours + optional effective date + prices. Omit for a flat rate. */
  readonly peak?: PeakPricing
}

/** Plugin configuration: model id → pricing. Unlisted models show a "configure" placeholder. */
export interface CostTrackerConfig {
  readonly models: Record<string, ModelPricing>
}

/** Per-call cost breakdown, broken out by token bucket. */
export interface CostBreakdown {
  /** Total cost in configured currency units. */
  readonly cost: number
  /** Whether the call landed in a configured peak window. */
  readonly isPeak: boolean
  readonly inputMissCost: number
  readonly inputHitCost: number
  readonly cacheWriteCost: number
  readonly outputCost: number
}

/** Result of pricing one call: configured → breakdown, or unconfigured → placeholder. */
export type CostResult =
  | { readonly status: 'configured'; readonly breakdown: CostBreakdown }
  | { readonly status: 'unconfigured'; readonly model: string }

/** Per-model cost broken out by bucket, accumulated over one aggregate. */
export interface ModelCostDetail {
  /** Cache-hit input cost. */
  readonly inputHit: number
  /** Cache-miss input cost (cache writes bill at the miss tier and fold in here). */
  readonly inputMiss: number
  /** Output cost. */
  readonly output: number
  /** `inputHit + inputMiss + output`. */
  readonly total: number
}

/** An aggregated cost unit: one session, one workspace, or the global total. */
export interface CostAggregate {
  /** Total cost across all priced calls. */
  readonly totalCost: number
  /** Cost accrued during peak windows. */
  readonly peakCost: number
  /** Cost accrued during off-peak windows. */
  readonly offpeakCost: number
  /** Number of calls priced. */
  readonly callCount: number
  /** Number of calls that hit an unconfigured model. */
  readonly unconfiguredCalls: number
  /** Distinct unconfigured model ids encountered (for the placeholder prompt). */
  readonly unconfiguredModels: readonly string[]
  /** Per-model bucket cost. */
  readonly byModel: Record<string, ModelCostDetail>
}

/** Aggregated cost projection for a session (what the `cost` projection publishes). */
export type SessionCostProjection = CostAggregate

/** TokenUsage type re-export for consumers that need the raw buckets. */
export type { TokenUsage }
