/** Saasu "Purchase Order" → PurchaseOrder, over the documented samples. */
import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/purchaseorder'
import { invoiceSummary } from '../fixtures'

describe('transformPurchaseOrder (saasu)', () => {
  it('maps the documented fields, amounts in minor units', () => {
    const po = PurchaseOrderSchema.parse(
      transformPurchaseOrder(
        invoiceSummary({
          InvoiceType: 'Purchase Order',
          TransactionType: 'P',
          Currency: 'KWD',
          TotalAmount: 1.234,
        }),
      ),
    )
    expect(po).toMatchObject({
      id: '5093684',
      status: 'ACTIVE',
      contactId: '1568986',
      totalAmount: 1234,
    })
    expect(po.lineItems).toBeUndefined()
  })
})
