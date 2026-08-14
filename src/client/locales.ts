/** Locale namespace owned by the cost tracker's browser readout. */
export const NS = 'cost-tracker'

/** Simplified-Chinese cost-bar strings. */
export const zh = {
  'bar.session': '本会话成本 ¥{amount}',
  'bar.peak': '高峰 ¥{amount}',
  'bar.unconfigured': '未配价: {models}',
} as const

/** English cost-bar strings. */
export const en: Record<keyof typeof zh, string> = {
  'bar.session': 'Session cost ¥{amount}',
  'bar.peak': 'peak ¥{amount}',
  'bar.unconfigured': 'unpriced: {models}',
}

/** Stable locale keys consumed by the cost bar. */
export type CostBarKey = keyof typeof zh
