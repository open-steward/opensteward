import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type SilaStubExpense } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/expense'

function makeRaw(overrides: Partial<SilaStubExpense> = {}): SilaStubExpense {
  return { ...overrides }
}

describe('sila transformExpense', () => {
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
