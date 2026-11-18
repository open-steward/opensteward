import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type PeakAccountExpense } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/expense'

function makeExpense(overrides: Partial<PeakAccountExpense> = {}): PeakAccountExpense {
  return {
    id: 'EXP-001',
    date: '2024-01-25',
    description: 'Business travel',
    amount: 3500,
    categoryId: 'CAT-001',
    currency: 'THB',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('EXP-001')
    expect(result.name).toBe('Business travel')
    expect(result.totalAmount).toBe(3500)
    expect(result.currency).toBe('THB')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformExpense(makeExpense({ description: '', currency: '' }))
    expect(result.name).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
