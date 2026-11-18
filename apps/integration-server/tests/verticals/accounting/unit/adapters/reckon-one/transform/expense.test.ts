import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type ReckonOneExpenseReceipt,
} from '../../../../../../../src/verticals/accounting/adapters/reckon-one/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<ReckonOneExpenseReceipt> = {}): ReckonOneExpenseReceipt {
  return {
    id: 'exp_001',
    description: 'Client dinner',
    supplier: { id: 'supp_rest_001', name: 'The Restaurant' },
    date: '2024-03-20',
    currency: 'AUD',
    totalAmount: 350.0,
    taxAmount: 31.82,
    paymentMethod: 'CARD',
    lines: [
      {
        id: 'line_001',
        accountId: 'acct_meals',
        description: 'Meals & Entertainment',
        amount: 318.18,
        taxAmount: 31.82,
      },
    ],
    createdDateTime: '2024-03-20T20:00:00Z',
    modifiedDateTime: '2024-03-21T09:00:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('exp_001')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Client dinner')
  })

  it('maps supplier.id to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('supp_rest_001')
  })

  it('falls back to contact.id when supplier is absent', () => {
    const result = transformExpense(
      makeExpense({ supplier: undefined, contact: { id: 'cont_001', name: 'Caterer' } }),
    )
    expect(result.contactId).toBe('cont_001')
  })

  it('maps currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('AUD')
  })

  it('maps paymentMethod', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('CARD')
  })

  it('converts totalAmount to minor units', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(35000)
  })

  it('converts taxAmount to minor units', () => {
    expect(transformExpense(makeExpense()).taxAmount).toBe(3182)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps createdDateTime to createdAt', () => {
    expect(transformExpense(makeExpense()).createdAt).toEqual(new Date('2024-03-20T20:00:00Z'))
  })

  it('maps lines to lineItems with minor unit conversion', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('acct_meals')
    expect(result.lineItems?.[0].totalAmount).toBe(31818)
    expect(result.lineItems?.[0].taxAmount).toBe(3182)
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces output that passes ExpenseSchema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformExpense({ id: 'exp_001' })
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
