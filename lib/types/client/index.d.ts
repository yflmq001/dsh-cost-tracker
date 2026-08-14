/** Browser plugin owning the per-session cost readout on the composer dock. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type CostBarKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'cost-tracker': CostBarKey;
    }
}
export declare const inject: string[];
/**
 * Register the cost readout into the composer dock (stats-line family, after
 * the shipped stats strip) and its locale dictionary.
 * @param ctx - browser context carrying slots and locale services.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map