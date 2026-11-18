import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type NiboPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/purchaseorder'

function makeRaw(overrides: Partial<NiboPurchaseOrder> = {}): NiboPurchaseOrder {
  return {
    purchaseOrderId: 1,
    orderNumber: 'OC-001',
    supplierId: 10,
    currencyCode: 'BRL',
    orderDate: '2024-06-01',
    status: 'Active',
    totalValue: 2000,
    taxValue: 320,
    items: [],
    ...overrides,
  }
}

describe('nibo transformPurchaseOrder', () => {
  it('maps purchaseOrderId to id as string', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })
  it('maps status Received -> COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'Received' })).status).toBe('COMPLETED')
  })
  it('maps status Cancelled -> CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })
  it('maps orderDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
