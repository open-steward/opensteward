import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type LexofficePurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<LexofficePurchaseOrder> = {}): LexofficePurchaseOrder {
  return {
    id: 'po-uuid-001',
    voucherNumber: 'PO-2024-001',
    voucherDate: '2024-03-01',
    deliveryDate: '2024-03-15',
    contactId: 'vendor-uuid-001',
    totalAmount: 3000,
    currency: 'EUR',
    voucherStatus: 'open',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-uuid-001')
  })

  it('maps contactId correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps totalAmount correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3000)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps voucherStatus draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voucherStatus open to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'open' })).status).toBe('ACTIVE')
  })

  it('maps voucherStatus accepted to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps voucherStatus received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'received' })).status).toBe('COMPLETED')
  })

  it('maps voucherStatus cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps voucherStatus rejected to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps unknown voucherStatus to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ voucherStatus: 'other' })).status).toBe('DRAFT')
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
