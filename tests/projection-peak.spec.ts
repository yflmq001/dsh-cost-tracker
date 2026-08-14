import { describe, expect, it } from 'vitest'
import { costProjectionDefinition } from '../src/cost-projection.ts'
import type { CostTrackerConfig, SessionCostProjection } from '../src/types.ts'

const config: CostTrackerConfig = {
  models: {
    'deepseek-v4-flash': {
      inputMiss: 1, inputHit: 0.02, output: 2,
      peak: { hours: ['09:00-12:00'], inputMiss: 2, inputHit: 0.04, output: 4 },
    },
  },
}

// Beijing 09:30 == UTC 01:30
const peakMs = Date.UTC(2026, 7, 14, 1, 30, 0)

const headerEvent = {
  type: 'request/header', time: peakMs, seq: 1,
  data: { header: { config: { model: 'deepseek-v4-flash' } } },
} as any

const msgEvent = {
  type: 'assistant/message', time: peakMs, seq: 2,
  data: { turn: 1, step: 1, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
} as any

describe('cost projection peak pricing', () => {
  it('prices at peak rate when peak config is present', () => {
    const def = costProjectionDefinition(config)
    let state = def.init()
    state = def.apply(state, headerEvent)
    state = def.apply(state, msgEvent)
    const totals = def.view(state) as SessionCostProjection
    // peak inputMiss = 2 yuan/M; 1M tokens => 2.0 (not 1.0 off-peak)
    expect(totals.byModel['deepseek-v4-flash']!.inputMiss).toBeCloseTo(2.0, 6)
    expect(totals.totalCost).toBeCloseTo(2.0, 6)
    expect(totals.peakCost).toBeCloseTo(2.0, 6)
  })
})
