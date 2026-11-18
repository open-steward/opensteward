import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ProsvasisPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ProsvasisPurchaseOrder> = {}): ProsvasisPurchaseOrder {
  return {
    id: '8001',
    SeriesNumber: 'PO-2024-001',
    Status: 'Draft',
    Date: '2024-03-01',
    TotalAmount: 930,
    VatAmount: 180,
    Currency: 'EUR',
    SupplierId: '80',
    Lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('8001')
    expect(result.contactId).toBe('80')
    expect(result.totalAmount).toBe(930)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Issued to ACTIVE', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Issued' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Delivered to COMPLETED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Delivered' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePurchaseOrder()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
