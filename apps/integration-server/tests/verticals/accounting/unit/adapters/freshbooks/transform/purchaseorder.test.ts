import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type FreshBooksPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FreshBooksPurchaseOrder> = {}): FreshBooksPurchaseOrder {
  return {
    id: 600,
    vendor_id: 7,
    po_number: 'PO-2024-001',
    date: '2024-03-01',
    currency_code: 'USD',
    amount: { amount: '750.00', code: 'USD' },
    status: 4,
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('600')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('7')
  })

  it('maps currency_code to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(750)
  })

  it('parses date as Date object for postedAt', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 4 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 4 })).status).toBe('ACTIVE')
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 6 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 6 })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 99 })).status).toBe('DRAFT')
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
