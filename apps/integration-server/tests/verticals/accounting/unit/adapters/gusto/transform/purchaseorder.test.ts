import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type GustoPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<GustoPurchaseOrder> = {}): GustoPurchaseOrder {
  return {
    id: 'po_001',
    status: 'draft',
    date: '2024-03-10',
    vendor_id: 'vendor_001',
    total_amount: 1800,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ id: 'po_001' })).id).toBe('po_001')
  })

  it('maps numeric id to string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ id: 20 })).id).toBe('20')
  })

  it('maps total_amount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ total_amount: 2200 })).totalAmount).toBe(2200)
  })

  it('maps vendor_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ vendor_id: 'vendor_77' })).contactId).toBe('vendor_77')
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ currency: 'EUR' })).currency).toBe('EUR')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps submitted status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'submitted' })).status).toBe('ACTIVE')
  })

  it('maps received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('parses date as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ date: '2024-03-10' })).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ id: 'po_001' }))
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
