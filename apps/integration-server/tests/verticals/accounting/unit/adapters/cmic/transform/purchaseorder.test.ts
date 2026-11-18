import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type CmicPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<CmicPurchaseOrder> = {}): CmicPurchaseOrder {
  return {
    PurchaseOrderId: 'PO-001',
    OrderNumber: 'PO-2024-001',
    Status: 'Draft',
    VendorId: 'VND-789',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    TotalAmount: 35000,
    OrderDate: '2024-02-28',
    Lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (CMiC)', () => {
  it('maps id from PurchaseOrderId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('PO-001')
  })

  it('maps core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('VND-789')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(35000)
  })

  it('parses OrderDate as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-02-28'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Closed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps Void status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Void' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
