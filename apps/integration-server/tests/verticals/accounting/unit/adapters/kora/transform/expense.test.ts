import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type KoraStubExpense } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/expense'

function makeRaw(overrides: KoraStubExpense = {}): KoraStubExpense {
  return { ...overrides }
}

describe('kora transformExpense', () => {
  it('handles empty object gracefully', () => {
    expect(() => transformExpense(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
