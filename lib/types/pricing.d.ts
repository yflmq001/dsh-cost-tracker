/**
 * Pure pricing functions: peak-window detection and per-call cost math.
 *
 * Kept free of Cordis/session imports so they unit-test in isolation.
 */
import type { CostBreakdown, CostResult, ModelPricing, TokenUsage } from './types.ts';
/** True when `date` (any tz) falls inside one of the Beijing-time `peakHours` ranges. */
export declare function isPeakBeijing(date: Date, peakHours: readonly string[] | undefined): boolean;
/**
 * Compute the cost of one model call.
 *
 * Cache write is priced at the miss rate (conservative: providers bill the
 * write at the miss tier; the written tokens become cache hits on a later call).
 */
export declare function computeCost(usage: TokenUsage, pricing: ModelPricing, timestampMs: number): CostBreakdown;
/** Price one call against the config; unconfigured models yield a placeholder result. */
export declare function priceUsage(usage: TokenUsage, model: string, models: Record<string, ModelPricing>, timestampMs: number): CostResult;
//# sourceMappingURL=pricing.d.ts.map