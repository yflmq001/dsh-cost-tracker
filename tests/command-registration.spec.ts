/**
 * Unit tests for the `/cost` command registration wiring.
 */

import { describe, expect, it, vi } from 'vitest'
import { registerCostCommand } from '../src/command.ts'
import { zeroAggregate } from '../src/billing.ts'

/** Minimal stand-in for the cordis context `registerCostCommand` needs. */
function mockCtx() {
  const register = vi.fn()
  const effect = vi.fn((fn: () => void) => { fn() })
  return { effect, commands: { register } }
}

describe('registerCostCommand', () => {
  it('registers a command named "cost" with a description', () => {
    const ctx = mockCtx()
    registerCostCommand(ctx as never, () => ({ key: 'test', aggregate: zeroAggregate() }))
    expect(ctx.commands.register).toHaveBeenCalledTimes(1)
    const def = ctx.commands.register.mock.calls[0]![0]
    expect(def.name).toBe('cost')
    expect(def.description).toBeTruthy()
  })
  it('handler reports the receiving session scoped to its workspace', async () => {
    const ctx = mockCtx()
    const resolved = { key: 'test', aggregate: { ...zeroAggregate(), totalCost: 2.5, callCount: 4 } }
    const resolve = vi.fn(() => resolved)
    registerCostCommand(ctx as never, resolve)
    const def = ctx.commands.register.mock.calls[0]![0]
    const result = await def.handler({ agent: { session: { id: 's1' } } })
    expect(resolve).toHaveBeenCalledWith({ id: 's1' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('工作区 test')
    expect(result.text).toContain('总计 ¥2.5000')
    expect(result.text).toContain('调用 4 次')
  })
})
