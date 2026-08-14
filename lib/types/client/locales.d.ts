/** Locale namespace owned by the cost tracker's browser readout. */
export declare const NS = "cost-tracker";
/** Simplified-Chinese cost-bar strings. */
export declare const zh: {
    readonly 'bar.session': "本会话成本 ¥{amount}";
    readonly 'bar.peak': "高峰 ¥{amount}";
    readonly 'bar.unconfigured': "未配价: {models}";
};
/** English cost-bar strings. */
export declare const en: Record<keyof typeof zh, string>;
/** Stable locale keys consumed by the cost bar. */
export type CostBarKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map