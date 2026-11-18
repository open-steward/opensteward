/** Saasu "Sale Order" / "Purchase Order" → Order, over the documented samples. */
import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  isPurchaseOrder,
  isSaleOrder,
  transformOrder,
} from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/order'
import { invoiceDetail, invoiceSummary } from '../fixtures'

describe('transformOrder (saasu)', () => {
  it('maps a sale order as an open SALES order, amounts in minor units', () => {
    const order = OrderSchema.parse(transformOrder(invoiceSummary({ InvoiceType: 'Sale Order' })))
    expect(order).toMatchObject({
      id: '5093684',
      type: 'SALES',
      status: 'ACTIVE',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      postedAt: '2015-01-24',
    })
    expect(order.lineItems).toBeUndefined()
  })

  it('maps a purchase order as PURCHASE', () => {
    const order = OrderSchema.parse(
      transformOrder(invoiceDetail({ InvoiceType: 'Purchase Order', TransactionType: 'P' })),
    )
    expect(order.type).toBe('PURCHASE')
    expect(order.lineItems).toHaveLength(1)
  })

  it('tells sale orders from purchase orders from invoices', () => {
    expect(isSaleOrder(invoiceSummary({ InvoiceType: 'Sale Order' }))).toBe(true)
    expect(isSaleOrder(invoiceSummary())).toBe(false)
    expect(
      isPurchaseOrder(invoiceSummary({ InvoiceType: 'Purchase Order', TransactionType: 'P' })),
    ).toBe(true)
    expect(isPurchaseOrder(invoiceSummary({ InvoiceType: 'Purchase Order' }))).toBe(false)
  })
})
