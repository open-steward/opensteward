import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type MorningExpense } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/expense'

function makeExpense(overrides: Partial<MorningExpense> = {}): MorningExpense {
  return {
    id: 'exp_1',
    date: '2024-03-10',
    description: 'Office supplies',
    sum: 500,
    currency: 'ILS',
    clientId: 'supplier_2',
    ...overrides,
  }
}

describe('transformExpense (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp_1')
    expect(result.name).toBe('Office supplies')
    expect(result.totalAmount).toBe(500)
    expect(result.currency).toBe('ILS')
    expect(result.contactId).toBe('supplier_2')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing description', () => {
    const result = transformExpense(makeExpense({ description: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
