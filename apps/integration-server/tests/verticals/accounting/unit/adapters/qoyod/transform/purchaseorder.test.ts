import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type QoyodPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeRaw(overrides: Partial<QoyodPurchaseOrder> = {}): QoyodPurchaseOrder {
  return {
    id: 1000,
    reference: 'PO-2025-001',
    vendor_id: 55,
    date: '2025-06-01',
    expected_delivery_date: '2025-06-15',
    status: 'received',
    currency: 'SAR',
    total: 3000,
    tax_total: 450,
    line_items: [
      {
        id: 8,
        product_id: 22,
        description: 'Raw materials',
        quantity: 100,
        unit_price: 30,
        tax_amount: 450,
        total: 3450,
        account_id: 70,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformPurchaseOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('1000')
  })

  it('maps received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps completed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps billed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'billed' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps vendor_id to contactId as string', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformPurchaseOrder(makeRaw()).totalAmount).toBe(3000)
  })

  it('maps date to postedAt Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line product_id to itemId as string', () => {
    expect(transformPurchaseOrder(makeRaw()).lineItems?.[0]?.itemId).toBe('22')
  })

  it('passes PurchaseOrderSchema.parse', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makeRaw()))).not.toThrow()
  })
})
