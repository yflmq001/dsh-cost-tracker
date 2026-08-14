/**
 * Package-owned invariant companion for `dsh-cost-tracker`.
 * @module dsh-cost-tracker/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-cost-tracker'

/** Cordis companion plugin name. */
export const name = 'cost-tracker-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: per-call cost is derived output of the `cost`
 * projection, a pure synchronous fold over durable `assistant/message.usage`
 * events. The projection's zod schema pins the wire payload, and the fold is
 * monotone-additive per call, so there is no cross-event relationship whose
 * violation a runtime observer would catch that the schema already fixes.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
