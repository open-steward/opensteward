import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MoneyForwardStubExpense } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/expense'

describe('transformExpense (moneyforward stub)', () => {
  it('returns an object with metadata passthrough', () => {
    const raw: MoneyForwardStubExpense = { some_field: 'value' }
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object without crashing on empty input', () => {
    const raw: MoneyForwardStubExpense = {}
    const result = transformExpense(raw)
    expect(result).toBeDefined()
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { some_field: 'value' }
    const result = transformExpense(raw)
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
