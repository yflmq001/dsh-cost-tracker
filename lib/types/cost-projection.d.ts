/**
 * The `cost` session projection: folds durable provider usage into cost.
 *
 * Pure synchronous fold; prices only the finalized `assistant/message.usage`
 * (never the early `assistant/chunk` usage sample) so a call is never counted
 * twice. The model id is taken from the latest preceding `request/header`.
 */
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { CostTrackerConfig, SessionCostProjection } from './types.ts';
interface CostState {
    totals: SessionCostProjection;
    currentModel: string | undefined;
    lastSample: {
        turn: number;
        step: number;
    } | undefined;
}
export declare const costProjectionDefinition: (config: CostTrackerConfig) => ProjectionDefinition<"cost", CostState>;
export {};
//# sourceMappingURL=cost-projection.d.ts.map