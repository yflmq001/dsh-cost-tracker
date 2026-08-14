/**
 * Cost-tracking service: registers the `cost` session projection, maintains a
 * cross-session global bill, and persists the bill through the storage domain.
 *
 * @module dsh-cost-tracker
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CostTrackerConfig } from './types.ts';
import { type GlobalBill } from './billing.ts';
export type * from './types.ts';
export interface Config extends CostTrackerConfig {
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        costTracker: CostTracker;
    }
}
/** Replay-aware per-session cost service backed by the `cost` projection. */
export declare class CostTracker extends Service {
    static Config: z<Config>;
    /** Cross-session running total, fed by the projection change feed. */
    private _bill;
    /** Last cumulative `cost` value per session, to diff against the change feed. */
    private readonly sessionTotals;
    /** Opened storage domain, when a storage backend is present. */
    private domain;
    private persistTimer;
    /** Optional workspace registry, for grouping the bill by dsh workspace title. */
    private workspaceRegistry;
    constructor(ctx: Context, config?: Config);
    /** Current cross-session bill. */
    get bill(): GlobalBill;
    /** Resolve a session to its grouping key: workspace title, cwd basename, or per-session id. */
    private workspaceKey;
    /** Debounce a durable write after a change-feed delta. */
    private schedulePersist;
}
export default CostTracker;
//# sourceMappingURL=index.d.ts.map