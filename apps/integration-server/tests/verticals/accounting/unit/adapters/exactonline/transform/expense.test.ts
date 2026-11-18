import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense, type ExactExpense } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/expense'

function makeExpense(overrides: Partial<ExactExpense> = {}): ExactExpense {
  return { EntryID: 'exp-1', Supplier: 's-1', AmountDC: 300, VATAmountDC: 50, Currency: 'EUR', EntryDate: '2024-06-01', ...overrides }
}

describe('transformExpense (exactonline)', () => {
  it('maps id and contactId', () => {
    const r = transformExpense(makeExpense())
    expect(r.id).toBe('exp-1')
    expect(r.contactId).toBe('s-1')
  })
  it('maps totalAmount and taxAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(300)
    expect(transformExpense(makeExpense()).taxAmount).toBe(50)
  })
  it('maps postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-06-01'))
  })
  it('passes raw as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
