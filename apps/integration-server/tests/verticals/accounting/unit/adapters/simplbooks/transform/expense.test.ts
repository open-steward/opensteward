import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type SimplbooksExpense,
} from '../../../../../../../src/verticals/accounting/adapters/simplbooks/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<SimplbooksExpense> = {}): SimplbooksExpense {
  return {
    id: 20,
    supplier_id: 3,
    account_code: '6000',
    currency: 'EUR',
    total: 5000,
    total_vat: 800,
    expense_date: '2024-02-10',
    description: 'Travel expenses',
    rows: [
      {
        id: 1,
        account_code: '6001',
        description: 'Flight ticket',
        quantity: 1,
        unit_price: 4200,
        total: 5000,
        vat_amount: 800,
      },
    ],
    ...overrides,
  }
}

describe('transformExpense (simplbooks)', () => {
  it('maps numeric id to string id', () => {
    expect(transformExpense(makeRaw()).id).toBe('20')
  })

  it('maps description to name', () => {
    expect(transformExpense(makeRaw()).name).toBe('Travel expenses')
  })

  it('maps account_code to accountId', () => {
    expect(transformExpense(makeRaw()).accountId).toBe('6000')
  })

  it('maps supplier_id to contactId string', () => {
    expect(transformExpense(makeRaw()).contactId).toBe('3')
  })

  it('maps currency', () => {
    expect(transformExpense(makeRaw()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformExpense(makeRaw()).totalAmount).toBe(5000)
  })

  it('maps total_vat to taxAmount', () => {
    expect(transformExpense(makeRaw()).taxAmount).toBe(800)
  })

  it('maps expense_date string to Date', () => {
    expect(transformExpense(makeRaw()).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('maps rows to lineItems', () => {
    const result = transformExpense(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('6001')
    expect(result.lineItems![0].itemDescription).toBe('Flight ticket')
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeRaw()))).not.toThrow()
  })
})
