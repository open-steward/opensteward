import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type KlaraExpense,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<KlaraExpense> = {}): KlaraExpense {
  return {
    id: 'exp-1',
    name: 'Office supplies',
    account_id: 'acct-5',
    contact_id: 'cont-2',
    currency: 'CHF',
    payment_method: 'card',
    total_amount: 3500,
    tax_amount: 250,
    expense_date: '2024-05-10T00:00:00.000Z',
    created_at: '2024-05-10T00:00:00.000Z',
    updated_at: '2024-05-11T00:00:00.000Z',
    lines: [
      {
        id: 'line-1',
        account_id: 'acct-5',
        description: 'Pens and paper',
        unit_amount: 3500,
        quantity: 1,
        total_amount: 3500,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp-1')
    expect(result.name).toBe('Office supplies')
    expect(result.accountId).toBe('acct-5')
    expect(result.contactId).toBe('cont-2')
    expect(result.currency).toBe('CHF')
    expect(result.paymentMethod).toBe('card')
    expect(result.totalAmount).toBe(3500)
    expect(result.taxAmount).toBe(250)
  })

  it('parses expense_date as postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-05-10T00:00:00.000Z'))
  })

  it('maps lines to lineItems', () => {
    const result = transformExpense(makeExpense())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Pens and paper')
    expect(result.lineItems![0].totalAmount).toBe(3500)
    expect(result.lineItems![0].unitQuantity).toBe(1)
  })

  it('omits lineItems when lines is empty', () => {
    const result = transformExpense(makeExpense({ lines: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })
})
