import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ICountExpense } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/expense'

function makeExpense(overrides: Partial<ICountExpense> = {}): ICountExpense {
  return {
    doc_id: 'exp_10',
    date: '2024-03-08',
    description: 'Travel expenses',
    sum: 750,
    currency_code: 'ILS',
    client_id: 'sup_5',
    ...overrides,
  }
}

describe('transformExpense (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp_10')
    expect(result.name).toBe('Travel expenses')
    expect(result.totalAmount).toBe(750)
    expect(result.currency).toBe('ILS')
    expect(result.contactId).toBe('sup_5')
  })

  it('parses date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-08'))
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
