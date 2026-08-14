/**
 * Cross-session global bill aggregation.
 *
 * Pure folds kept free of Cordis imports so they unit-test in isolation.
 * The service feeds them the per-session `cost` projection deltas from the
 * projection change feed, bucketed into per-workspace aggregates.
 */
import { z } from 'zod';
import type { CostAggregate, ModelCostDetail } from './types.ts';
/** A cross-session running total plus its per-workspace breakdown. */
export interface GlobalBill extends CostAggregate {
    /** Workspace (or `session:<id>` for workspace-less sessions) → aggregate. */
    byWorkspace: Record<string, CostAggregate>;
}
/** Durable-boundary schema for the global bill (persisted via storage domain). */
export declare const globalBillSchema: z.ZodObject<{
    totalCost: z.ZodNumber;
    peakCost: z.ZodNumber;
    offpeakCost: z.ZodNumber;
    callCount: z.ZodNumber;
    unconfiguredCalls: z.ZodNumber;
    unconfiguredModels: z.ZodArray<z.ZodString>;
    byModel: z.ZodRecord<z.ZodString, z.ZodObject<{
        inputHit: z.ZodNumber;
        inputMiss: z.ZodNumber;
        output: z.ZodNumber;
        total: z.ZodNumber;
    }, z.core.$strip>>;
    byWorkspace: z.ZodRecord<z.ZodString, z.ZodObject<{
        totalCost: z.ZodNumber;
        peakCost: z.ZodNumber;
        offpeakCost: z.ZodNumber;
        callCount: z.ZodNumber;
        unconfiguredCalls: z.ZodNumber;
        unconfiguredModels: z.ZodArray<z.ZodString>;
        byModel: z.ZodRecord<z.ZodString, z.ZodObject<{
            inputHit: z.ZodNumber;
            inputMiss: z.ZodNumber;
            output: z.ZodNumber;
            total: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const zeroModelDetail: () => ModelCostDetail;
export declare const zeroAggregate: () => CostAggregate;
export declare const zeroBill: () => GlobalBill;
/** Add one delta aggregate into an accumulator. */
export declare function mergeAggregate(acc: CostAggregate, delta: CostAggregate): CostAggregate;
/**
 * Signed difference `cur - prev` for two cumulative snapshots of one session.
 * Per-model deltas keep only positive `total` (a model's cost can only grow);
 * `unconfiguredModels` is the current cumulative set.
 */
export declare function diffAggregate(prev: CostAggregate, cur: CostAggregate): CostAggregate;
/**
 * Fold one session's delta into the global bill, bucketing it under
 * `workspaceKey` (the session `cwd`, or a `session:<id>` fallback) when known.
 */
export declare function mergeBill(acc: GlobalBill, delta: CostAggregate, workspaceKey: string | undefined): GlobalBill;
/** Merge a full global bill into another (used to rehydrate over the durable base). */
export declare function mergeGlobalBill(acc: GlobalBill, delta: GlobalBill): GlobalBill;
//# sourceMappingURL=billing.d.ts.map