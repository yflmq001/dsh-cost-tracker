/**
 * Unit tests for the global-bill aggregation folds.
 */

import { describe, expect, it } from 'vitest'
import { diffAggregate, mergeAggregate, mergeBill, zeroAggregate, zeroBill, zeroModelDetail } from '../src/billing.ts'
import type { CostAggregate, ModelCostDetail } from '../src/types.ts'

const detail = (over: Partial<ModelCostDetail> = {}): ModelCostDetail => ({ ...zeroModelDetail(), ...over })

const agg = (over: Partial<CostAggregate> = {}): CostAggregate => ({ ...zeroAggregate(), ...over })

describe('mergeAggregate', () => {
  it('sums numeric fields and per-model buckets', () => {
    const out = mergeAggregate(
      agg({
        totalCost: 1, peakCost: 0.5, offpeakCost: 0.5, callCount: 2,
        byModel: { 'a': detail({ inputHit: 1, inputMiss: 2, output: 3, total: 6 }) },
      }),
      agg({
        totalCost: 2, peakCost: 1, offpeakCost: 1, callCount: 3,
        byModel: {
          'a': detail({ inputHit: 1, inputMiss: 1, output: 1, total: 3 }),
          'b': detail({ inputHit: 0.5, inputMiss: 0.5, output: 0, total: 1 }),
        },
      }),
    )
    expect(out.totalCost).toBeCloseTo(3)
    expect(out.peakCost).toBeCloseTo(1.5)
    expect(out.callCount).toBe(5)
    expect(out.byModel.a).toEqual({ inputHit: 2, inputMiss: 3, output: 4, total: 9 })
    expect(out.byModel['b']!.total).toBeCloseTo(1)
  })
  it('unions unconfigured models', () => {
    const out = mergeAggregate(agg({ unconfiguredModels: ['x'] }), agg({ unconfiguredModels: ['x', 'y'] }))
    expect([...out.unconfiguredModels].sort()).toEqual(['x', 'y'])
  })
})

describe('diffAggregate', () => {
  it('subtracts numeric fields', () => {
    const d = diffAggregate(agg({ totalCost: 1 }), agg({ totalCost: 3 }))
    expect(d.totalCost).toBeCloseTo(2)
  })
  it('keeps only positive per-model deltas', () => {
    const d = diffAggregate(
      agg({ byModel: { 'a': detail({ inputHit: 5, total: 5 }) } }),
      agg({ byModel: { 'a': detail({ inputHit: 7, total: 7 }), 'b': detail({ output: 2, total: 2 }) } }),
    )
    expect(d.byModel['a']!.total).toBeCloseTo(2)
    expect(d.byModel['b']!.total).toBeCloseTo(2)
  })
})

describe('mergeBill', () => {
  it('buckets a delta under its workspace key', () => {
    const out = mergeBill(zeroBill(), agg({ totalCost: 4, byModel: { 'a': detail({ output: 4, total: 4 }) } }), '/ws')
    expect(out.totalCost).toBeCloseTo(4)
    expect(out.byWorkspace['/ws']!.totalCost).toBeCloseTo(4)
  })
  it('accumulates into an existing workspace', () => {
    const first = mergeBill(zeroBill(), agg({ totalCost: 1 }), '/ws')
    const second = mergeBill(first, agg({ totalCost: 2 }), '/ws')
    expect(second.byWorkspace['/ws']!.totalCost).toBeCloseTo(3)
  })
  it('keeps workspace out of the bill when key is undefined', () => {
    const out = mergeBill(zeroBill(), agg({ totalCost: 1 }), undefined)
    expect(Object.keys(out.byWorkspace)).toHaveLength(0)
  })
})
