import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type PennylanePurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<PennylanePurchaseOrder> = {}): PennylanePurchaseOrder {
  return {
    id: 'po-1',
    reference: 'PO-2024-001',
    supplier: { source_id: 'sup-1' },
    date: '2024-09-01',
    currency: 'EUR',
    amount: 1500,
    status: 'draft',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps supplier source_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('sup-1')
  })

  it('returns undefined contactId when supplier is null', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ supplier: null })).contactId).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(1500)
  })

  it('parses date as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status accepted to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status rejected to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'rejected' })).status).toBe('CANCELLED')
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
