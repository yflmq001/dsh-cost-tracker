import { basename } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { z as z$1 } from "zod";
import { defineDomain } from "@deepseek-ai/dsh-storage-domain";
//#region lib/types/pricing.js
/**
* Pure pricing functions: peak-window detection and per-call cost math.
*
* Kept free of Cordis/session imports so they unit-test in isolation.
*/
const TOKENS_PER_MILLION = 1e6;
/** Parse a `"HH:MM"` string into minutes since midnight (Beijing-local). */
function minutesOf(hhmm) {
	const [hh = "0", mm = "0"] = hhmm.split(":");
	return Number(hh) * 60 + Number(mm);
}
/** True when `date` (any tz) falls inside one of the Beijing-time `peakHours` ranges. */
function isPeakBeijing(date, peakHours) {
	if (peakHours === void 0 || peakHours.length === 0) return false;
	const bj = new Date(date.getTime() + 8 * 36e5);
	const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
	for (const range of peakHours) {
		const [start = "", end = ""] = range.split("-");
		if (start === "" || end === "") continue;
		const s = minutesOf(start);
		const e = minutesOf(end);
		if (e <= s) {
			if (minutes >= s || minutes < e) return true;
		} else if (minutes >= s && minutes < e) return true;
	}
	return false;
}
/** Select the effective price tier for a call: peak tier when configured and in-window. */
function effectiveTier(pricing, isPeak) {
	if (isPeak && pricing.peak !== void 0) return {
		inputMiss: pricing.peak.inputMiss,
		inputHit: pricing.peak.inputHit ?? pricing.peak.inputMiss,
		output: pricing.peak.output
	};
	return {
		inputMiss: pricing.inputMiss,
		inputHit: pricing.inputHit ?? pricing.inputMiss,
		output: pricing.output
	};
}
/**
* Compute the cost of one model call.
*
* Cache write is priced at the miss rate (conservative: providers bill the
* write at the miss tier; the written tokens become cache hits on a later call).
*/
function computeCost(usage, pricing, timestampMs) {
	const date = new Date(timestampMs);
	const peak = pricing.peak;
	const inWindow = isPeakBeijing(date, peak?.hours);
	const effective = peak !== void 0 && peak.enabled !== false;
	const isPeak = inWindow && effective;
	const tier = effectiveTier(pricing, isPeak);
	const inputMissCost = usage.inputTokens / TOKENS_PER_MILLION * tier.inputMiss;
	const inputHitCost = (usage.cacheReadTokens ?? 0) / TOKENS_PER_MILLION * tier.inputHit;
	const cacheWriteCost = (usage.cacheWriteTokens ?? 0) / TOKENS_PER_MILLION * tier.inputMiss;
	const outputCost = usage.outputTokens / TOKENS_PER_MILLION * tier.output;
	return {
		cost: inputMissCost + inputHitCost + cacheWriteCost + outputCost,
		isPeak,
		inputMissCost,
		inputHitCost,
		cacheWriteCost,
		outputCost
	};
}
/** Price one call against the config; unconfigured models yield a placeholder result. */
function priceUsage(usage, model, models, timestampMs) {
	const pricing = models[model];
	if (pricing === void 0) return {
		status: "unconfigured",
		model
	};
	return {
		status: "configured",
		breakdown: computeCost(usage, pricing, timestampMs)
	};
}
//#endregion
//#region lib/types/cost-projection.js
/**
* The `cost` session projection: folds durable provider usage into cost.
*
* Pure synchronous fold; prices only the finalized `assistant/message.usage`
* (never the early `assistant/chunk` usage sample) so a call is never counted
* twice. The model id is taken from the latest preceding `request/header`.
*/
const zeroProjection = () => ({
	totalCost: 0,
	peakCost: 0,
	offpeakCost: 0,
	callCount: 0,
	unconfiguredCalls: 0,
	unconfiguredModels: [],
	byModel: {}
});
/** Fold one call's bucket costs into a per-model detail (cache write bills at the miss tier). */
function addModelDetail(prev, b) {
	const inputMiss = b.inputMissCost + b.cacheWriteCost;
	return {
		inputHit: (prev?.inputHit ?? 0) + b.inputHitCost,
		inputMiss: (prev?.inputMiss ?? 0) + inputMiss,
		output: (prev?.output ?? 0) + b.outputCost,
		total: (prev?.total ?? 0) + b.cost
	};
}
const modelCostDetailSchema$1 = z$1.object({
	inputHit: z$1.number(),
	inputMiss: z$1.number(),
	output: z$1.number(),
	total: z$1.number()
});
const costSchema = z$1.object({
	totalCost: z$1.number(),
	peakCost: z$1.number(),
	offpeakCost: z$1.number(),
	callCount: z$1.number().int().nonnegative(),
	unconfiguredCalls: z$1.number().int().nonnegative(),
	unconfiguredModels: z$1.array(z$1.string()),
	byModel: z$1.record(z$1.string(), modelCostDetailSchema$1)
}).strict();
const costProjectionDefinition = (config) => ({
	key: "cost",
	schema: costSchema,
	init: () => ({
		totals: zeroProjection(),
		currentModel: void 0,
		lastSample: void 0
	}),
	apply: (state, event) => {
		let next = state;
		if (event.type === "request/header") next = {
			...next,
			currentModel: event.data.header.config.model
		};
		if (event.type === "assistant/message" && event.data.usage !== void 0) {
			const { turn, step, usage } = event.data;
			if (state.lastSample !== void 0 && state.lastSample.turn === turn && state.lastSample.step === step) return next;
			const model = next.currentModel;
			if (model === void 0) {
				next = {
					...next,
					lastSample: {
						turn,
						step
					},
					totals: {
						...next.totals,
						callCount: next.totals.callCount + 1
					}
				};
				return next;
			}
			const result = priceUsage(usage, model, config.models, event.time);
			if (result.status === "configured") {
				const b = result.breakdown;
				next = {
					...next,
					lastSample: {
						turn,
						step
					},
					totals: {
						totalCost: next.totals.totalCost + b.cost,
						peakCost: next.totals.peakCost + (b.isPeak ? b.cost : 0),
						offpeakCost: next.totals.offpeakCost + (b.isPeak ? 0 : b.cost),
						callCount: next.totals.callCount + 1,
						unconfiguredCalls: next.totals.unconfiguredCalls,
						unconfiguredModels: next.totals.unconfiguredModels,
						byModel: {
							...next.totals.byModel,
							[model]: addModelDetail(next.totals.byModel[model], b)
						}
					}
				};
			} else next = {
				...next,
				lastSample: {
					turn,
					step
				},
				totals: {
					...next.totals,
					callCount: next.totals.callCount + 1,
					unconfiguredCalls: next.totals.unconfiguredCalls + 1,
					unconfiguredModels: next.totals.unconfiguredModels.includes(model) ? next.totals.unconfiguredModels : [...next.totals.unconfiguredModels, model]
				}
			};
		}
		return next;
	},
	view: (state) => state.totals,
	stateVersion: 1
});
//#endregion
//#region lib/types/billing.js
/**
* Cross-session global bill aggregation.
*
* Pure folds kept free of Cordis imports so they unit-test in isolation.
* The service feeds them the per-session `cost` projection deltas from the
* projection change feed, bucketed into per-workspace aggregates.
*/
const modelCostDetailSchema = z$1.object({
	inputHit: z$1.number(),
	inputMiss: z$1.number(),
	output: z$1.number(),
	total: z$1.number()
});
const aggregateSchema = z$1.object({
	totalCost: z$1.number(),
	peakCost: z$1.number(),
	offpeakCost: z$1.number(),
	callCount: z$1.number().int().nonnegative(),
	unconfiguredCalls: z$1.number().int().nonnegative(),
	unconfiguredModels: z$1.array(z$1.string()),
	byModel: z$1.record(z$1.string(), modelCostDetailSchema)
});
/** Durable-boundary schema for the global bill (persisted via storage domain). */
const globalBillSchema = aggregateSchema.extend({ byWorkspace: z$1.record(z$1.string(), aggregateSchema) });
const zeroModelDetail = () => ({
	inputHit: 0,
	inputMiss: 0,
	output: 0,
	total: 0
});
const zeroAggregate = () => ({
	totalCost: 0,
	peakCost: 0,
	offpeakCost: 0,
	callCount: 0,
	unconfiguredCalls: 0,
	unconfiguredModels: [],
	byModel: {}
});
const zeroBill = () => ({
	...zeroAggregate(),
	byWorkspace: {}
});
/** Add one delta aggregate into an accumulator. */
function mergeAggregate(acc, delta) {
	const byModel = { ...acc.byModel };
	for (const [model, d] of Object.entries(delta.byModel)) {
		const p = byModel[model] ?? zeroModelDetail();
		byModel[model] = {
			inputHit: p.inputHit + d.inputHit,
			inputMiss: p.inputMiss + d.inputMiss,
			output: p.output + d.output,
			total: p.total + d.total
		};
	}
	return {
		totalCost: acc.totalCost + delta.totalCost,
		peakCost: acc.peakCost + delta.peakCost,
		offpeakCost: acc.offpeakCost + delta.offpeakCost,
		callCount: acc.callCount + delta.callCount,
		unconfiguredCalls: acc.unconfiguredCalls + delta.unconfiguredCalls,
		unconfiguredModels: [...new Set([...acc.unconfiguredModels, ...delta.unconfiguredModels])],
		byModel
	};
}
/**
* Signed difference `cur - prev` for two cumulative snapshots of one session.
* Per-model deltas keep only positive `total` (a model's cost can only grow);
* `unconfiguredModels` is the current cumulative set.
*/
function diffAggregate(prev, cur) {
	const byModel = {};
	for (const model of new Set([...Object.keys(prev.byModel), ...Object.keys(cur.byModel)])) {
		const p = prev.byModel[model] ?? zeroModelDetail();
		const c = cur.byModel[model] ?? zeroModelDetail();
		const d = {
			inputHit: c.inputHit - p.inputHit,
			inputMiss: c.inputMiss - p.inputMiss,
			output: c.output - p.output,
			total: c.total - p.total
		};
		if (d.total > 0) byModel[model] = d;
	}
	return {
		totalCost: cur.totalCost - prev.totalCost,
		peakCost: cur.peakCost - prev.peakCost,
		offpeakCost: cur.offpeakCost - prev.offpeakCost,
		callCount: cur.callCount - prev.callCount,
		unconfiguredCalls: cur.unconfiguredCalls - prev.unconfiguredCalls,
		unconfiguredModels: cur.unconfiguredModels,
		byModel
	};
}
/**
* Fold one session's delta into the global bill, bucketing it under
* `workspaceKey` (the session `cwd`, or a `session:<id>` fallback) when known.
*/
function mergeBill(acc, delta, workspaceKey) {
	const base = mergeAggregate(acc, delta);
	if (workspaceKey === void 0) return {
		...base,
		byWorkspace: acc.byWorkspace
	};
	const byWorkspace = { ...acc.byWorkspace };
	byWorkspace[workspaceKey] = mergeAggregate(byWorkspace[workspaceKey] ?? zeroAggregate(), delta);
	return {
		...base,
		byWorkspace
	};
}
/** Merge a full global bill into another (used to rehydrate over the durable base). */
function mergeGlobalBill(acc, delta) {
	const base = mergeAggregate(acc, delta);
	const byWorkspace = { ...acc.byWorkspace };
	for (const [key, ws] of Object.entries(delta.byWorkspace)) byWorkspace[key] = mergeAggregate(byWorkspace[key] ?? zeroAggregate(), ws);
	return {
		...base,
		byWorkspace
	};
}
//#endregion
//#region lib/types/cost-domain.js
/**
* Storage-domain spec for the cross-session global bill.
*
* The domain's single global record holds the running total; it is loaded at
* open and rewritten on each change feed delta (debounced by the caller).
*
* @module dsh-cost-tracker/cost-domain
*/
/** The `cost_tracker` storage domain: one global record, no tables. */
const costDomainSpec = defineDomain({
	name: "cost_tracker",
	version: 1,
	global: {
		schema: globalBillSchema,
		initial: zeroBill()
	},
	tables: {}
});
//#endregion
//#region lib/types/command.js
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
const SESSION_PREFIX = "session:";
/** Append one aggregate's per-model bucket lines. */
function appendModels(lines, agg) {
	for (const [model, d] of Object.entries(agg.byModel)) lines.push(`  ${model}  命中 ¥${d.inputHit.toFixed(4)}  未命中 ¥${d.inputMiss.toFixed(4)}  输出 ¥${d.output.toFixed(4)}  合计 ¥${d.total.toFixed(4)}`);
	if (agg.unconfiguredModels.length > 0) lines.push(`  ⚠️ 未配置价格: ${agg.unconfiguredModels.join(", ")}（请补充价格配置）`);
}
/** Render one workspace (or session) aggregate as the `/cost` command body. */
function formatScope(key, agg) {
	const lines = [];
	const label = key.startsWith(SESSION_PREFIX) ? `会话 ${key.slice(8)}` : `工作区 ${key}`;
	lines.push(`${label}（合计 ¥${agg.totalCost.toFixed(4)}，调用 ${agg.callCount} 次）`);
	appendModels(lines, agg);
	lines.push("────────────────");
	lines.push(`总计 ¥${agg.totalCost.toFixed(4)}  高峰 ¥${agg.peakCost.toFixed(4)} / 空闲 ¥${agg.offpeakCost.toFixed(4)}  调用 ${agg.callCount} 次`);
	return lines.join("\n");
}
/**
* Register the `/cost` command on a context whose `commands` service is ready.
* The aggregate is resolved per invocation from the receiving agent's session,
* so the report always scopes to the current workspace (never the global bill).
* @param ctx - context carrying the `commands` service.
* @param resolve - maps the receiving session to its scope label + aggregate.
*/
function registerCostCommand(ctx, resolve) {
	ctx.effect(() => ctx.commands.register({
		name: "cost",
		description: "Show token cost for the current workspace",
		handler: async (invocation) => {
			const { key, aggregate } = resolve(invocation.agent.session);
			return {
				kind: "success",
				text: formatScope(key, aggregate)
			};
		}
	}), "cost-tracker: command");
}
//#endregion
//#region lib/types/index.js
/**
* Cost-tracking service: registers the `cost` session projection, maintains a
* cross-session global bill, and persists the bill through the storage domain.
*
* @module dsh-cost-tracker
*/
/** Schemastery schema for the pricing table; unlisted models show a "configure" placeholder. */
const optionalNumber = z.union([z.number(), void 0]);
const optionalBoolean = z.union([z.boolean(), void 0]);
const configSchema = z.object({ models: z.dict(z.object({
	inputMiss: z.number(),
	inputHit: optionalNumber,
	output: z.number(),
	peak: z.union([z.object({
		hours: z.array(z.string()),
		enabled: optionalBoolean,
		inputMiss: z.number(),
		inputHit: optionalNumber,
		output: z.number()
	}), void 0])
})).default({}) });
/** Replay-aware per-session cost service backed by the `cost` projection. */
var CostTracker = class extends Service {
	static Config = configSchema;
	/** Cross-session running total, fed by the projection change feed. */
	_bill = zeroBill();
	/** Last cumulative `cost` value per session, to diff against the change feed. */
	sessionTotals = /* @__PURE__ */ new WeakMap();
	/** Opened storage domain, when a storage backend is present. */
	domain;
	persistTimer;
	/** Optional workspace registry, for grouping the bill by dsh workspace title. */
	workspaceRegistry;
	constructor(ctx, config = { models: {} }) {
		super(ctx, "costTracker");
		ctx.inject(["sessionProjections"], (projectionCtx) => {
			projectionCtx.sessionProjections.register(costProjectionDefinition(config));
			projectionCtx.sessionProjections.onChanged((session, key, value) => {
				if (key !== "cost") return;
				const cur = value;
				const prev = this.sessionTotals.get(session);
				const delta = prev === void 0 ? cur : diffAggregate(prev, cur);
				this.sessionTotals.set(session, cur);
				this._bill = mergeBill(this._bill, delta, this.workspaceKey(session));
				this.schedulePersist();
			});
		});
		ctx.inject(["storageDomain"], (storageCtx) => {
			storageCtx.storageDomain.open(costDomainSpec).then((domain) => {
				this.domain = domain;
				ctx.effect(() => () => domain.close().catch(() => {}), "cost-tracker: domain close");
				const stored = domain.global.get();
				if (stored !== void 0) this._bill = mergeGlobalBill(stored, this._bill);
			}).catch((error) => {
				ctx.logger.warn(`cost-tracker: storage domain open failed: ${String(error)}`);
			});
		});
		ctx.inject(["workspaceRegistry"], (wsCtx) => {
			this.workspaceRegistry = wsCtx.workspaceRegistry;
		});
		ctx.effect(() => () => {
			if (this.persistTimer !== void 0) {
				clearTimeout(this.persistTimer);
				this.persistTimer = void 0;
			}
		}, "cost-tracker: persist timer");
		ctx.inject(["commands"], (cmdCtx) => {
			registerCostCommand(cmdCtx, (session) => {
				const key = this.workspaceKey(session);
				return {
					key,
					aggregate: this._bill.byWorkspace[key] ?? zeroAggregate()
				};
			});
		});
	}
	/** Current cross-session bill. */
	get bill() {
		return this._bill;
	}
	/** Resolve a session to its grouping key: workspace title, cwd basename, or per-session id. */
	workspaceKey(session) {
		const reg = this.workspaceRegistry;
		if (reg !== void 0) try {
			for (const ws of reg.list()) if (ws.sessionIds.includes(session.id)) return ws.title;
		} catch {}
		const cwd = session.header.cwd;
		if (cwd !== void 0 && cwd !== "") return basename(cwd);
		return `session:${session.id}`;
	}
	/** Debounce a durable write after a change-feed delta. */
	schedulePersist() {
		if (this.persistTimer !== void 0) return;
		this.persistTimer = setTimeout(() => {
			this.persistTimer = void 0;
			if (this.domain !== void 0) this.domain.global.set(this._bill).catch(() => {});
		}, 1e3);
	}
};
//#endregion
export { CostTracker, CostTracker as default };
