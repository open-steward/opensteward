import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type InfaktCost,
} from '../../../../../../../src/verticals/accounting/adapters/infakt/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeCost(overrides: Partial<InfaktCost> = {}): InfaktCost {
  return {
    uuid: 'cost-uuid-abc',
    issue_date: '2024-12-01',
    net_price: 8130, // already in groszy (minor units)
    tax_price: 1870,
    gross_price: 10000,
    client_id: 33,
    currency: 'PLN',
    payment_method: 'cash',
    note: 'Office supplies',
    created_at: '2024-12-01T11:00:00.000Z',
    ...overrides,
  }
}

describe('transformExpense (infakt)', () => {
  it('maps uuid to id', () => {
    expect(transformExpense(makeCost()).id).toBe('cost-uuid-abc')
  })

  it('maps client_id to contactId as string', () => {
    expect(transformExpense(makeCost()).contactId).toBe('33')
  })

  it('omits contactId when client_id is null', () => {
    expect(transformExpense(makeCost({ client_id: null })).contactId).toBeUndefined()
  })

  it('maps currency', () => {
    expect(transformExpense(makeCost()).currency).toBe('PLN')
  })

  it('passes gross_price directly as totalAmount (already groszy, no conversion)', () => {
    expect(transformExpense(makeCost({ gross_price: 10000 })).totalAmount).toBe(10000)
  })

  it('passes tax_price directly as taxAmount', () => {
    expect(transformExpense(makeCost({ tax_price: 1870 })).taxAmount).toBe(1870)
  })

  it('maps payment_method to paymentMethod', () => {
    expect(transformExpense(makeCost()).paymentMethod).toBe('cash')
  })

  it('maps issue_date to postedAt via toIsoDatetime', () => {
    expect(transformExpense(makeCost()).postedAt).toEqual(new Date('2024-12-01T00:00:00.000Z'))
  })

  it('maps created_at to createdAt', () => {
    expect(transformExpense(makeCost()).createdAt).toEqual(new Date('2024-12-01T11:00:00.000Z'))
  })

  it('handles null issue_date gracefully', () => {
    expect(transformExpense(makeCost({ issue_date: null })).postedAt).toBeUndefined()
  })

  it('produces a schema-valid Expense', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeCost()))).not.toThrow()
  })
})
