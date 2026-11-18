import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type CalxaPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePurchaseOrder(overrides: Partial<CalxaPurchaseOrder> = {}): CalxaPurchaseOrder {
  return {
    id: 'po-001',
    orderNumber: 'PO-001',
    contactId: 'contact-42',
    status: 'completed',
    currency: 'USD',
    total: 950,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id as-is', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-001')
  })

  it('maps contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(950)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps status billed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'billed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps status canceled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'canceled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps undefined status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: undefined })).status).toBe('ACTIVE')
  })

  it('maps createdAt to Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() =>
      PurchaseOrderSchema.parse(transformPurchaseOrder(makePurchaseOrder())),
    ).not.toThrow()
  })
})
