import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FoundationPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FoundationPurchaseOrder> = {}): FoundationPurchaseOrder {
  return {
    PurchaseOrderId: 'PO-001',
    PurchaseOrderNumber: 'PO-2024-001',
    JobNumber: 'JOB-100',
    VendorId: 'VEND-42',
    OrderDate: '2024-03-01',
    TotalAmount: 8000,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('PO-001')
    expect(result.contactId).toBe('VEND-42')
    expect(result.totalAmount).toBe(8000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
