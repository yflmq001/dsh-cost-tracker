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
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { CostAggregate } from './types.ts';
/** Render one workspace (or session) aggregate as the `/cost` command body. */
export declare function formatScope(key: string, agg: CostAggregate): string;
/** Resolve the receiving session to its workspace aggregate. */
export type ScopeResolver = (session: Session) => {
    key: string;
    aggregate: CostAggregate;
};
/**
 * Register the `/cost` command on a context whose `commands` service is ready.
 * The aggregate is resolved per invocation from the receiving agent's session,
 * so the report always scopes to the current workspace (never the global bill).
 * @param ctx - context carrying the `commands` service.
 * @param resolve - maps the receiving session to its scope label + aggregate.
 */
export declare function registerCostCommand(ctx: Context, resolve: ScopeResolver): void;
//# sourceMappingURL=command.d.ts.map