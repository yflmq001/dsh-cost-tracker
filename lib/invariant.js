//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `dsh-cost-tracker`.
* @module dsh-cost-tracker/invariant
*/
const PACKAGE_NAME = "dsh-cost-tracker";
/** Cordis companion plugin name. */
const name = "cost-tracker-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: per-call cost is derived output of the `cost`
* projection, a pure synchronous fold over durable `assistant/message.usage`
* events. The projection's zod schema pins the wire payload, and the fold is
* monotone-additive per call, so there is no cross-event relationship whose
* violation a runtime observer would catch that the schema already fixes.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
