import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/order'
import type { XeroPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<XeroPurchaseOrder> = {}): XeroPurchaseOrder {
  return {
    PurchaseOrderID: 'po-001',
    PurchaseOrderNumber: 'PO-2024-001',
    Contact: { ContactID: 'cid-1' },
    DateString: '2024-04-01',
    DeliveryDateString: '2024-04-15',
    CurrencyCode: 'GBP',
    Total: 8000,
    TotalTax: 0,
    Status: 'AUTHORISED',
    LineItems: [],
    DeliveryAddress: '',
    AttentionTo: '',
    ...overrides,
  }
}

// Xero has no sales-order entity and no order-union endpoint of its own:
// PurchaseOrders is the only order-like document it exposes, so `order`
// reads the same records `purchaseorder` does, tagged `type: 'PURCHASE'`.
describe('transformOrder (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makePurchaseOrder())
    expect(result.id).toBe('po-001')
    expect(result.contactId).toBe('cid-1')
    expect(result.totalAmount).toBe(800000)
    expect(result.currency).toBe('GBP')
    expect(result.type).toBe('PURCHASE')
  })

  it('maps DRAFT status to ACTIVE', () => {
    expect(transformOrder(makePurchaseOrder({ Status: 'DRAFT' })).status).toBe('ACTIVE')
  })

  it('maps SUBMITTED status to ACTIVE', () => {
    expect(transformOrder(makePurchaseOrder({ Status: 'SUBMITTED' })).status).toBe('ACTIVE')
  })

  it('maps AUTHORISED status to ACTIVE', () => {
    expect(transformOrder(makePurchaseOrder({ Status: 'AUTHORISED' })).status).toBe('ACTIVE')
  })

  it('maps BILLED status to COMPLETED', () => {
    expect(transformOrder(makePurchaseOrder({ Status: 'BILLED' })).status).toBe('COMPLETED')
  })

  it('maps DELETED status to CANCELLED', () => {
    expect(transformOrder(makePurchaseOrder({ Status: 'DELETED' })).status).toBe('CANCELLED')
  })

  it('emits postedAt as a calendar date, matching the source precision', () => {
    const result = transformOrder(makePurchaseOrder())
    expect(result.postedAt).toBe('2024-04-01')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makePurchaseOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
