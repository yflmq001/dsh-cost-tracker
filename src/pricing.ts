/**
 * Pure pricing functions: peak-window detection and per-call cost math.
 *
 * Kept free of Cordis/session imports so they unit-test in isolation.
 */

import type { CostBreakdown, CostResult, ModelPricing, TokenUsage } from './types.ts'

const TOKENS_PER_MILLION = 1_000_000

/** Parse a `"HH:MM"` string into minutes since midnight (Beijing-local). */
function minutesOf(hhmm: string): number {
  const [hh = '0', mm = '0'] = hhmm.split(':')
  return Number(hh) * 60 + Number(mm)
}

/** True when `date` (any tz) falls inside one of the Beijing-time `peakHours` ranges. */
export function isPeakBeijing(date: Date, peakHours: readonly string[] | undefined): boolean {
  if (peakHours === undefined || peakHours.length === 0) return false
  // Beijing is fixed UTC+8 with no daylight saving: shift into UTC and read fields.
  const bj = new Date(date.getTime() + 8 * 3600_000)
  const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
  for (const range of peakHours) {
    const [start = '', end = ''] = range.split('-')
    if (start === '' || end === '') continue
    const s = minutesOf(start)
    const e = minutesOf(end)
    if (e <= s) {
      // Overnight range (e.g. "22:00-02:00"): wraps past midnight.
      if (minutes >= s || minutes < e) return true
    } else if (minutes >= s && minutes < e) {
      return true
    }
  }
  return false
}

/** Select the effective price tier for a call: peak tier when configured and in-window. */
function effectiveTier(pricing: ModelPricing, isPeak: boolean): {
  readonly inputMiss: number
  readonly inputHit: number
  readonly output: number
} {
  if (isPeak && pricing.peak !== undefined) {
    return {
      inputMiss: pricing.peak.inputMiss,
      inputHit: pricing.peak.inputHit ?? pricing.peak.inputMiss,
      output: pricing.peak.output,
    }
  }
  return {
    inputMiss: pricing.inputMiss,
    inputHit: pricing.inputHit ?? pricing.inputMiss,
    output: pricing.output,
  }
}

/**
 * Compute the cost of one model call.
 *
 * Cache write is priced at the miss rate (conservative: providers bill the
 * write at the miss tier; the written tokens become cache hits on a later call).
 */
export function computeCost(
  usage: TokenUsage,
  pricing: ModelPricing,
  timestampMs: number,
): CostBreakdown {
  const date = new Date(timestampMs)
  const peak = pricing.peak
  const inWindow = isPeakBeijing(date, peak?.hours)
  const effective = peak !== undefined && peak.enabled !== false
  const isPeak = inWindow && effective
  const tier = effectiveTier(pricing, isPeak)
  const inputMissCost = (usage.inputTokens / TOKENS_PER_MILLION) * tier.inputMiss
  const inputHitCost = ((usage.cacheReadTokens ?? 0) / TOKENS_PER_MILLION) * tier.inputHit
  const cacheWriteCost = ((usage.cacheWriteTokens ?? 0) / TOKENS_PER_MILLION) * tier.inputMiss
  const outputCost = (usage.outputTokens / TOKENS_PER_MILLION) * tier.output
  return {
    cost: inputMissCost + inputHitCost + cacheWriteCost + outputCost,
    isPeak,
    inputMissCost,
    inputHitCost,
    cacheWriteCost,
    outputCost,
  }
}

/** Price one call against the config; unconfigured models yield a placeholder result. */
export function priceUsage(
  usage: TokenUsage,
  model: string,
  models: Record<string, ModelPricing>,
  timestampMs: number,
): CostResult {
  const pricing = models[model]
  if (pricing === undefined) return { status: 'unconfigured', model }
  return { status: 'configured', breakdown: computeCost(usage, pricing, timestampMs) }
}
