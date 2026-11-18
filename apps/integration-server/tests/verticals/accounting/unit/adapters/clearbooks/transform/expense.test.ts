import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ClearBooksExpense } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/expense'

function makeExpense(overrides: Partial<ClearBooksExpense> = {}): ClearBooksExpense {
  return {
    expense_id: '801',
    date: '05/03/2024',
    description: 'Office supplies',
    total_gross: 120,
    total_tax: 20,
    currency: 'GBP',
    entity_id: '42',
    ...overrides,
  }
}

describe('transformExpense (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('801')
    expect(result.name).toBe('Office supplies')
    expect(result.totalAmount).toBe(120)
    expect(result.taxAmount).toBe(20)
    expect(result.currency).toBe('GBP')
    expect(result.contactId).toBe('42')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('converts numeric expense_id to string', () => {
    const result = transformExpense(makeExpense({ expense_id: 999 }))
    expect(result.id).toBe('999')
  })

  it('handles missing description gracefully', () => {
    const result = transformExpense(makeExpense({ description: '' }))
    expect(result.name).toBeUndefined()
  })

  it('handles zero tax amount', () => {
    const result = transformExpense(makeExpense({ total_tax: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
