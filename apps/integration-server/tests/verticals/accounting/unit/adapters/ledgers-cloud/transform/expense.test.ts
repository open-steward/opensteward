import { describe, it, expect } from 'vitest'
import { transformExpense } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

const base = {
  id: 'exp-5',
  voucher_number: 'VOUCH-001',
  voucher_date: '2024-07-15T00:00:00.000Z',
  contact: { id: 'cont-9' },
  account_id: 'acct-100',
  currency: 'USD',
  total_amount: 4500,
  tax_amount: 400,
  payment_method: 'cash',
  notes: 'Travel expenses',
  created_at: '2024-07-15T00:00:00.000Z',
  updated_at: '2024-07-16T00:00:00.000Z',
  items: [
    {
      id: 'li-2',
      description: 'Flight ticket',
      unit_price: 4500,
      quantity: 1,
      amount: 4500,
      tax_amount: 400,
      account_id: 'acct-100',
    },
  ],
}

describe('transformExpense', () => {
  it('maps core fields', () => {
    const result = transformExpense(base)
    expect(result.id).toBe('exp-5')
    expect(result.contactId).toBe('cont-9')
    expect(result.accountId).toBe('acct-100')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(4500)
    expect(result.taxAmount).toBe(400)
    expect(result.paymentMethod).toBe('cash')
  })

  it('parses voucher_date as postedAt', () => {
    expect(transformExpense(base).postedAt).toEqual(new Date('2024-07-15T00:00:00.000Z'))
  })

  it('maps contact from nested contact.id', () => {
    expect(transformExpense(base).contactId).toBe('cont-9')
  })

  it('maps contact from flat contact_id when nested absent', () => {
    const result = transformExpense({ ...base, contact: undefined, contact_id: 'flat-2' })
    expect(result.contactId).toBe('flat-2')
  })

  it('maps items to lineItems', () => {
    const result = transformExpense(base)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Flight ticket')
    expect(result.lineItems![0].totalAmount).toBe(4500)
  })

  it('passes schema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(base))).not.toThrow()
  })
})
