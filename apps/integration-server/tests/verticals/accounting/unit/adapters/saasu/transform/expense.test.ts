/** Saasu "Money Out (Expense)" → Expense, over the documented samples. */
import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import {
  isExpense,
  transformExpense,
} from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/expense'
import { invoiceDetail, invoiceSummary } from '../fixtures'

const moneyOut = { TransactionType: 'P', InvoiceType: 'Money Out (Expense)' }

describe('transformExpense (saasu)', () => {
  it('maps the documented fields, amounts in minor units', () => {
    const exp = ExpenseSchema.parse(
      transformExpense(invoiceSummary({ ...moneyOut, TotalTaxAmount: 0.95 })),
    )
    expect(exp).toMatchObject({
      id: '5093684',
      name: 'Invoice for order 1123',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      taxAmount: 95,
      lineAmountsIncludeTax: true,
      postedAt: '2015-01-24',
    })
    expect(exp.lineItems).toBeUndefined()
  })

  it('maps detail line items', () => {
    const exp = ExpenseSchema.parse(transformExpense(invoiceDetail(moneyOut)))
    expect(exp.lineItems![0]).toMatchObject({ totalAmount: 1045 })
  })

  it('recognises only Money Out purchases', () => {
    expect(isExpense(invoiceSummary(moneyOut))).toBe(true)
    expect(isExpense(invoiceSummary({ ...moneyOut, TransactionType: 'S' }))).toBe(false)
    expect(isExpense(invoiceSummary({ TransactionType: 'P' }))).toBe(false)
  })
})
