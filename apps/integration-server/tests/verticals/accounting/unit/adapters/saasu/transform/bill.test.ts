/** Saasu purchase tax / RCT invoice → Bill, over the documented samples. */
import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  isPurchaseBill,
  transformBill,
} from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/bill'
import { invoiceDetail, invoiceSummary } from '../fixtures'

const purchase = { TransactionType: 'P' }

describe('transformBill (saasu)', () => {
  it('maps the documented fields, amounts in minor units', () => {
    const bill = BillSchema.parse(
      transformBill(invoiceSummary({ ...purchase, TotalTaxAmount: 0.95, PaymentStatus: 'P' })),
    )
    expect(bill).toMatchObject({
      id: '5093684',
      status: 'PAID',
      billNumber: 'INV-1123',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      taxAmount: 95,
      balanceAmount: 1150,
      postedAt: '2015-01-24',
    })
    expect(bill.lineItems).toBeUndefined()
  })

  it('maps detail line items', () => {
    const bill = BillSchema.parse(transformBill(invoiceDetail(purchase)))
    expect(bill.lineItems).toHaveLength(1)
    expect(bill.lineItems![0]).toMatchObject({
      unitAmount: 1150,
      totalAmount: 1045,
      unitQuantity: 3,
    })
  })

  it('recognises purchase tax invoices and RCT invoices only', () => {
    expect(isPurchaseBill(invoiceSummary(purchase))).toBe(true)
    expect(isPurchaseBill(invoiceSummary({ ...purchase, InvoiceType: 'RCT Invoice' }))).toBe(true)
    expect(isPurchaseBill(invoiceSummary())).toBe(false)
    expect(isPurchaseBill(invoiceSummary({ ...purchase, InvoiceType: 'Purchase Order' }))).toBe(
      false,
    )
    expect(
      isPurchaseBill(invoiceSummary({ ...purchase, InvoiceType: 'Money Out (Expense)' })),
    ).toBe(false)
  })
})
