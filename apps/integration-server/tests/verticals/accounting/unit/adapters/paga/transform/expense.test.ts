import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type PagaStubExpense } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/expense'

function makeRaw(overrides: Partial<PagaStubExpense> = {}): PagaStubExpense {
  return { ...overrides }
}

describe('paga transformExpense', () => {
  it('handles missing optional fields gracefully', () => {
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
