/**
 * Session-projection type-table entry for the `cost` projection.
 *
 * @module dsh-cost-tracker/projection
 */

import type { SessionCostProjection } from './types.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Per-session cost aggregate across the complete durable log. */
    cost: SessionCostProjection
  }
}

export type { SessionCostProjection }
