import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type DirectoPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeRaw(overrides: Partial<DirectoPurchaseOrder> = {}): DirectoPurchaseOrder {
  return {
    number: '6001',
    date: '2024-06-01',
    suppliercode: 'SUPP01',
    currency: 'EUR',
    sum: 500,
    status: '',
    rows: [],
    ...overrides,
  }
}

describe('directo transformPurchaseOrder', () => {
  it('maps number to id as string', () => {
    const result = transformPurchaseOrder(makeRaw({ number: 88 }))
    expect(result.id).toBe('88')
  })

  it('maps suppliercode to contactId', () => {
    const result = transformPurchaseOrder(makeRaw({ suppliercode: 'S22' }))
    expect(result.contactId).toBe('S22')
  })

  it('status: received → COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'received' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('status: completed → COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('status: cancelled → CANCELLED', () => {
    const result = transformPurchaseOrder(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('status: default → ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ status: '' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps sum to totalAmount', () => {
    const result = transformPurchaseOrder(makeRaw({ sum: 750 }))
    expect(result.totalAmount).toBe(750)
  })

  it('maps row description to lineitem itemDescription', () => {
    const result = transformPurchaseOrder(
      makeRaw({ rows: [{ rn: 1, description: 'Office supplies', price: 50 }] }),
    )
    expect(result.lineItems?.[0]?.itemDescription).toBe('Office supplies')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
