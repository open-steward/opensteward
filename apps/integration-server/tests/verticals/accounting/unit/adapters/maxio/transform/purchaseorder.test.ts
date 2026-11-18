import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type MaxioPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<MaxioPurchaseOrder> = {}): MaxioPurchaseOrder {
  return {
    id: 700,
    state: 'active',
    created_at: '2024-03-12T00:00:00Z',
    currency: 'USD',
    total_amount_in_cents: 25000,
    vendor_id: 88,
    line_items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('700')
  })

  it('maps contacts from vendor_id as string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('88')
  })

  it('converts total_amount_in_cents to dollars', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ total_amount_in_cents: 25000 })).totalAmount).toBe(250)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('parses created_at as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-12T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('maps active state to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ state: 'active' })).status).toBe('ACTIVE')
  })

  it('maps completed state to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ state: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps canceled state to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ state: 'canceled' })).status).toBe('CANCELLED')
  })

  it('maps unknown state to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ state: 'pending' })).status).toBe('DRAFT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
