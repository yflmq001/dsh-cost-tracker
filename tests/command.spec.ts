/**
 * Unit tests for the `/cost` command body formatter.
 */

import { describe, expect, it } from 'vitest'
import { formatScope } from '../src/command.ts'
import { zeroAggregate, zeroModelDetail } from '../src/billing.ts'
import type { CostAggregate } from '../src/types.ts'

const agg = (over: Partial<CostAggregate> = {}): CostAggregate => ({ ...zeroAggregate(), ...over })

describe('formatScope', () => {
  it('renders an empty scope with a total line', () => {
    const text = formatScope('/ws', zeroAggregate())
    expect(text).toContain('工作区 /ws')
    expect(text).toContain('总计 ¥0.0000')
    expect(text).toContain('调用 0 次')
  })
  it('renders per-model buckets', () => {
    const text = formatScope('/ws', agg({
      totalCost: 1.5, peakCost: 1, offpeakCost: 0.5, callCount: 3,
      byModel: {
        'deepseek-v4-flash': { ...zeroModelDetail(), inputHit: 0.5, inputMiss: 0.5, output: 0.5, total: 1.5 },
      },
    }))
    expect(text).toContain('工作区 /ws')
    expect(text).toContain('命中 ¥0.5000')
    expect(text).toContain('未命中 ¥0.5000')
    expect(text).toContain('输出 ¥0.5000')
    expect(text).toContain('合计 ¥1.5000')
    expect(text).toContain('总计 ¥1.5000')
  })
  it('labels workspace-less sessions', () => {
    const text = formatScope('session:abc', agg({ totalCost: 0.5 }))
    expect(text).toContain('会话 abc')
  })
  it('flags unconfigured models', () => {
    const text = formatScope('/ws', agg({ unconfiguredModels: ['m'] }))
    expect(text).toContain('未配置价格: m')
  })
})
