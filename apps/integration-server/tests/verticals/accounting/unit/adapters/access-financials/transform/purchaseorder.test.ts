/**
 * Outstanding purchase order header → PurchaseOrder.
 *
 * The fixture is the documented response of "Get Outstanding Purchase
 * Orders" on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/purchasing-transactions,
 * cut to the fields this adapter selects, with `orderDate` in the schema's
 * `DateOnly` format.
 */
import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { purchaseOrderHeader } from '../fixtures'

describe('transformPurchaseOrder (access-financials)', () => {
  it('parses as a canonical PurchaseOrder', () => {
    expect(() =>
      PurchaseOrderSchema.parse(transformPurchaseOrder(purchaseOrderHeader())),
    ).not.toThrow()
  })

  it('maps the documented example', () => {
    const po = transformPurchaseOrder(purchaseOrderHeader())
    expect(po.id).toBe('5000')
    expect(po.status).toBe('ACTIVE')
    expect(po.contactId).toBe('supp_GB-S-1225')
    expect(po.postedAt).toBe('2023-05-17')
  })

  it('maps a completed order', () => {
    expect(transformPurchaseOrder(purchaseOrderHeader({ orderStatus: 'Complete' })).status).toBe(
      'COMPLETED',
    )
  })

  it('reports no money and no currency', () => {
    const po = transformPurchaseOrder(purchaseOrderHeader())
    expect(po.totalAmount).toBeUndefined()
    expect(po.currency).toBeUndefined()
  })
})
