import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type BlacklinePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BlacklinePurchaseOrder> = {}): BlacklinePurchaseOrder {
  return {
    purchaseOrderId: 'po-001',
    orderNumber: 'PO-2024-001',
    status: 'Draft',
    vendorId: 'vendor-456',
    currency: 'USD',
    totalAmount: 1800,
    orderDate: '2024-03-10',
    createdBy: 'user-1',
    createdAt: '2024-03-10T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-10T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (BlackLine)', () => {
  it('maps id from purchaseOrderId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-001')
  })

  it('maps core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('vendor-456')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(1800)
  })

  it('parses orderDate as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
