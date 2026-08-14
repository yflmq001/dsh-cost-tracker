/** Ambient per-session cost readout, mounted on the composer dock (stats-line family). */
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
/** Props: the projection read seat plus the dock's locale seat. */
interface CostBarProps {
    useProjection: UseProjection;
    t: PropsLocale<typeof NS>['t'];
}
/**
 * The per-session cost strip. Rides the durable `cost` projection, so paging
 * and compaction cannot change the figure; hidden until the session has at
 * least one billed call.
 */
export declare const CostBar: import("react").MemoExoticComponent<({ useProjection, t }: CostBarProps) => import("react").JSX.Element | null>;
export {};
//# sourceMappingURL=CostBar.d.ts.map