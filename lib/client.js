window.__ModuleLoader__.load({
	id: "dsh-cost-tracker",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/CostBar.tsx
		/** Ambient per-session cost readout, mounted on the composer dock (stats-line family). */
		/**
		* The per-session cost strip. Rides the durable `cost` projection, so paging
		* and compaction cannot change the figure; hidden until the session has at
		* least one billed call.
		*/
		const CostBar = (0, react.memo)(function CostBar({ useProjection, t }) {
			const cost = useProjection("cost");
			if (cost === void 0 || cost.callCount === 0) return null;
			const parts = [t("bar.session", { amount: cost.totalCost.toFixed(4) })];
			if (cost.peakCost > 0) parts.push(t("bar.peak", { amount: cost.peakCost.toFixed(4) }));
			if (cost.unconfiguredModels.length > 0) parts.push(t("bar.unconfigured", { models: cost.unconfiguredModels.join(", ") }));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: parts.join(" · ") });
		});
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace owned by the cost tracker's browser readout. */
		const NS = "cost-tracker";
		/** Simplified-Chinese cost-bar strings. */
		const zh = {
			"bar.session": "本会话成本 ¥{amount}",
			"bar.peak": "高峰 ¥{amount}",
			"bar.unconfigured": "未配价: {models}"
		};
		/** English cost-bar strings. */
		const en = {
			"bar.session": "Session cost ¥{amount}",
			"bar.peak": "peak ¥{amount}",
			"bar.unconfigured": "unpriced: {models}"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "locale"];
		/**
		* Register the cost readout into the composer dock (stats-line family, after
		* the shipped stats strip) and its locale dictionary.
		* @param ctx - browser context carrying slots and locale services.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "cost-tracker: browser dictionaries");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "cost",
				order: 10,
				locale: NS
			}, CostBar));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map