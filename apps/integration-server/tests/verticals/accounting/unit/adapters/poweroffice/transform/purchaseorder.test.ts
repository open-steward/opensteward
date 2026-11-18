import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type PowerOfficePurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<PowerOfficePurchaseOrder> = {}): PowerOfficePurchaseOrder {
  return {
    id: 400,
    supplierId: 8,
    orderDate: '2024-08-01',
    currencyCode: 'NOK',
    grossAmount: 3000,
    status: 1,
    orderNo: 'PO-2024-001',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('400')
  })

  it('maps supplierId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('8')
  })

  it('maps currencyCode to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3000)
  })

  it('parses orderDate as Date object for postedAt', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps status 5 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 5 })).status).toBe('COMPLETED')
  })

  it('maps status 9 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 9 })).status).toBe('CANCELLED')
  })

  it('maps other status values to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 1 })).status).toBe('ACTIVE')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 0 })).status).toBe('ACTIVE')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 3 })).status).toBe('ACTIVE')
  })

  it('sets contactId to undefined when supplierId is falsy', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ supplierId: 0 })).contactId).toBeUndefined()
  })

  it('sets postedAt to undefined when orderDate is empty', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ orderDate: '' })).postedAt).toBeUndefined()
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
