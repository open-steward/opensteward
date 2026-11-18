import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type TymsExpense,
} from '../../../../../../../src/verticals/accounting/adapters/tyms/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<TymsExpense> = {}): TymsExpense {
  return {
    uuid: 'exp-001',
    title: 'Office Supplies',
    date: '2024-04-01',
    due_date: '2024-04-30',
    amount: 500,
    tax: 50,
    currency: 'USD',
    payment_type: 'bank_transfer',
    vendor: { uuid: 'vendor-11', name: 'Staples' },
    created_at: '2024-04-01T00:00:00.000Z',
    updated_at: '2024-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeExpense())
    expect(result.id).toBe('exp-001')
    expect(result.name).toBe('Office Supplies')
    expect(result.contactId).toBe('vendor-11')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(50)
    expect(result.paymentMethod).toBe('bank_transfer')
  })

  it('parses postedAt date as Date object', () => {
    const result = transformExpense(makeExpense())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('handles tax in object form', () => {
    const result = transformExpense(makeExpense({ tax: { amount: 75 } }))
    expect(result.taxAmount).toBe(75)
  })

  it('sets contactId from vendor.uuid', () => {
    const result = transformExpense(makeExpense({ vendor: { uuid: 'v-22', name: 'Acme' } }))
    expect(result.contactId).toBe('v-22')
  })

  it('maps lineItems', () => {
    const raw = makeExpense({
      items: [{ uuid: 'item-1', name: 'Pen', price: 5, quantity: 10, amount: 50 }],
    })
    const result = transformExpense(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Pen')
    expect(result.lineItems![0].unitAmount).toBe(5)
    expect(result.lineItems![0].totalAmount).toBe(50)
  })

  it('passes raw as metadata', () => {
    const raw = makeExpense()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
