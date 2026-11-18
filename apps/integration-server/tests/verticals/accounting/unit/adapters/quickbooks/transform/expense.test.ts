import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  transformExpense,
  type QBOExpense,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/expense'

function makeExpense(overrides: Partial<QBOExpense> = {}): QBOExpense {
  return {
    Id: '55',
    PaymentType: 'CreditCard',
    EntityRef: { value: 'vend_10' },
    TxnDate: '2024-04-20',
    TotalAmt: 250,
    CurrencyRef: { value: 'USD' },
    AccountRef: { value: 'acc_5' },
    Line: [
      {
        Id: 'L1',
        Description: 'Office chairs',
        Amount: 250,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: { AccountRef: { value: 'acc_5' }, UnitPrice: 125, Qty: 2 },
      },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps Id to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('55')
  })

  it('maps EntityRef.value to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('vend_10')
  })

  it('maps AccountRef.value to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('acc_5')
  })

  it('maps PaymentType to paymentMethod', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('CreditCard')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(250)
  })

  it('parses TxnDate as postedAt Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-04-20'))
  })

  it('maps AccountBasedExpenseLineDetail lines', () => {
    const e = transformExpense(makeExpense())
    expect(e.lineItems).toHaveLength(1)
    expect(e.lineItems![0].accountId).toBe('acc_5')
    expect(e.lineItems![0].totalAmount).toBe(250)
  })

  it('filters out non-expense lines', () => {
    const raw = makeExpense({
      Line: [
        { Id: 'L1', Description: 'Tax', Amount: 10, DetailType: 'DescriptionOnly' },
      ],
    })
    expect(transformExpense(raw).lineItems).toHaveLength(0)
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformExpense(makeExpense())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
