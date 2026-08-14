/** Ambient per-session cost readout, mounted on the composer dock (stats-line family). */

import { memo } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the `cost` key into SessionProjectionMap for useProjection.
import type {} from '../projection.ts'
import { NS } from './locales.ts'

/** Props: the projection read seat plus the dock's locale seat. */
interface CostBarProps {
  useProjection: UseProjection
  t: PropsLocale<typeof NS>['t']
}

/**
 * The per-session cost strip. Rides the durable `cost` projection, so paging
 * and compaction cannot change the figure; hidden until the session has at
 * least one billed call.
 */
export const CostBar = memo(function CostBar({ useProjection, t }: CostBarProps) {
  const cost = useProjection('cost')
  if (cost === undefined || cost.callCount === 0) return null
  const parts: string[] = [t('bar.session', { amount: cost.totalCost.toFixed(4) })]
  if (cost.peakCost > 0) parts.push(t('bar.peak', { amount: cost.peakCost.toFixed(4) }))
  if (cost.unconfiguredModels.length > 0) {
    parts.push(t('bar.unconfigured', { models: cost.unconfiguredModels.join(', ') }))
  }
  return <span>{parts.join(' · ')}</span>
})
