import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type SageExpense } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/expense'

describe('transformExpense (SageBusinessCloud)', () => {
  it('maps id correctly', () => {
    const raw: SageExpense = { id: 'exp-001', amount: 500 }
    const result = transformExpense(raw)
    expect(result.id).toBe('exp-001')
  })

  it('sets metadata to raw object', () => {
    const raw: SageExpense = { id: 'exp-002' }
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'exp-001', amount: 500 }
    const result = transformExpense(raw)
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
