import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type XeroPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<XeroPurchaseOrder> = {}): XeroPurchaseOrder {
  return {
    PurchaseOrderID: 'po-001',
    PurchaseOrderNumber: 'PO-2024-001',
    Contact: { ContactID: 'vendor-1' },
    DateString: '2024-03-01',
    DeliveryDateString: '2024-03-15',
    CurrencyCode: 'GBP',
    Total: 4500,
    TotalTax: 750,
    Status: 'AUTHORISED',
    LineItems: [],
    DeliveryAddress: '123 Main St',
    AttentionTo: 'John Smith',
    ...overrides,
  }
}

describe('transformPurchaseOrder (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-001')
    expect(result.contactId).toBe('vendor-1')
    expect(result.totalAmount).toBe(450000)
    expect(result.currency).toBe('GBP')
  })

  it('maps DRAFT status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'DRAFT' })).status).toBe('ACTIVE')
  })

  it('maps SUBMITTED status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'SUBMITTED' })).status).toBe('ACTIVE')
  })

  it('maps AUTHORISED status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'AUTHORISED' })).status).toBe('ACTIVE')
  })

  it('maps BILLED status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'BILLED' })).status).toBe('COMPLETED')
  })

  it('maps DELETED status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'DELETED' })).status).toBe('CANCELLED')
  })

  it('emits postedAt/dueAt as calendar dates, matching the source precision', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toBe('2024-03-01')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
