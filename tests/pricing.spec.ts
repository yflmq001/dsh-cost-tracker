/**
 * Unit tests for the pure pricing functions (no Cordis/session deps).
 */

import { describe, expect, it } from 'vitest'
import { computeCost, isPeakBeijing, priceUsage } from '../src/pricing.ts'
import type { ModelPricing } from '../src/types.ts'

const flashPricing: ModelPricing = {
  inputMiss: 1.0,
  inputHit: 0.02,
  output: 2.0,
  peak: {
    hours: ['09:00-12:00', '14:00-18:00'],
    inputMiss: 3.0,
    inputHit: 0.10,
    output: 9.0,
  },
}

// Beijing 09:30 == UTC 01:30
const peakMs = Date.UTC(2026, 7, 14, 1, 30, 0)
// Beijing 20:00 == UTC 12:00 (off-peak)
const offpeakMs = Date.UTC(2026, 7, 14, 12, 0, 0)

describe('isPeakBeijing', () => {
  it('detects a peak window', () => {
    expect(isPeakBeijing(new Date(peakMs), ['09:00-12:00'])).toBe(true)
  })
  it('detects off-peak', () => {
    expect(isPeakBeijing(new Date(offpeakMs), ['09:00-12:00'])).toBe(false)
  })
  it('handles an overnight range across midnight', () => {
    const lateMs = Date.UTC(2026, 7, 14, 15, 0, 0) // Beijing 23:00
    expect(isPeakBeijing(new Date(lateMs), ['22:00-02:00'])).toBe(true)
  })
  it('returns false when no peak hours are configured', () => {
    expect(isPeakBeijing(new Date(peakMs), undefined)).toBe(false)
    expect(isPeakBeijing(new Date(peakMs), [])).toBe(false)
  })
})

describe('computeCost', () => {
  it('prices off-peak at base rates', () => {
    const b = computeCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      flashPricing,
      offpeakMs,
    )
    expect(b.isPeak).toBe(false)
    expect(b.cost).toBeCloseTo(1.0 + 2.0, 6) // 1M input-miss + 1M output
  })
  it('prices peak at peak rates', () => {
    const b = computeCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      flashPricing,
      peakMs,
    )
    expect(b.isPeak).toBe(true)
    expect(b.cost).toBeCloseTo(3.0 + 9.0, 6)
  })
  it('prices cache reads at the hit rate', () => {
    const b = computeCost(
      { inputTokens: 0, cacheReadTokens: 1_000_000, outputTokens: 0 },
      flashPricing,
      offpeakMs,
    )
    expect(b.cost).toBeCloseTo(0.02, 6)
  })
  it('prices cache writes at the miss rate (conservative)', () => {
    const b = computeCost(
      { inputTokens: 0, cacheWriteTokens: 1_000_000, outputTokens: 0 },
      flashPricing,
      offpeakMs,
    )
    expect(b.cost).toBeCloseTo(1.0, 6)
  })
  it('falls back to miss rate when no hit rate is configured', () => {
    const noHit: ModelPricing = { inputMiss: 1.0, output: 2.0 }
    const b = computeCost(
      { inputTokens: 0, cacheReadTokens: 1_000_000, outputTokens: 0 },
      noHit,
      offpeakMs,
    )
    expect(b.cost).toBeCloseTo(1.0, 6)
  })
  it('uses base rates when no peak tier is configured', () => {
    const noPeak: ModelPricing = { inputMiss: 1.0, output: 2.0 }
    const b = computeCost({ inputTokens: 1_000_000, outputTokens: 0 }, noPeak, peakMs)
    expect(b.isPeak).toBe(false)
    expect(b.cost).toBeCloseTo(1.0, 6)
  })
  it('treats a peak tier without an enabled flag as always-on', () => {
    const unflagged: ModelPricing = {
      inputMiss: 1.0,
      output: 2.0,
      peak: { hours: ['09:00-12:00'], inputMiss: 3.0, output: 9.0 },
    }
    const b = computeCost({ inputTokens: 1_000_000, outputTokens: 0 }, unflagged, peakMs)
    expect(b.isPeak).toBe(true)
    expect(b.cost).toBeCloseTo(3.0, 6)
  })
  it('uses base rates when the peak tier is disabled', () => {
    const disabled: ModelPricing = {
      inputMiss: 1.0,
      output: 2.0,
      peak: { hours: ['09:00-12:00'], enabled: false, inputMiss: 3.0, output: 9.0 },
    }
    const b = computeCost({ inputTokens: 1_000_000, outputTokens: 0 }, disabled, peakMs)
    expect(b.isPeak).toBe(false)
    expect(b.cost).toBeCloseTo(1.0, 6)
  })
  it('uses peak rates when the peak tier is explicitly enabled', () => {
    const enabled: ModelPricing = {
      inputMiss: 1.0,
      output: 2.0,
      peak: { hours: ['09:00-12:00'], enabled: true, inputMiss: 3.0, output: 9.0 },
    }
    const b = computeCost({ inputTokens: 1_000_000, outputTokens: 0 }, enabled, peakMs)
    expect(b.isPeak).toBe(true)
    expect(b.cost).toBeCloseTo(3.0, 6)
  })
})

describe('priceUsage', () => {
  it('returns configured with a breakdown for a known model', () => {
    const r = priceUsage(
      { inputTokens: 1_000_000, outputTokens: 0 },
      'deepseek-v4-flash',
      { 'deepseek-v4-flash': flashPricing },
      offpeakMs,
    )
    expect(r.status).toBe('configured')
    if (r.status === 'configured') expect(r.breakdown.cost).toBeCloseTo(1.0, 6)
  })
  it('returns unconfigured for an unknown model', () => {
    const r = priceUsage(
      { inputTokens: 1_000_000, outputTokens: 0 },
      'gpt-4o',
      { 'deepseek-v4-flash': flashPricing },
      offpeakMs,
    )
    expect(r).toEqual({ status: 'unconfigured', model: 'gpt-4o' })
  })
})
