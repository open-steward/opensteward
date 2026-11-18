import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type SevDeskPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<SevDeskPurchaseOrder> = {}): SevDeskPurchaseOrder {
  return {
    id: 'po-1',
    orderNumber: 'PO-2024-001',
    contact: { id: 'sup-1' },
    orderDate: '2024-08-01',
    currency: 'EUR',
    sumNet: '3000.00',
    sumGross: '3570.00',
    sumTax: '570.00',
    status: '100',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps contact id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('sup-1')
  })

  it('maps currency correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3570)
  })

  it('parses orderDate as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps status 100 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: '100' })).status).toBe('ACTIVE')
  })

  it('maps status 1000 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: '1000' })).status).toBe('CANCELLED')
  })

  it('handles null contact', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ contact: null })).contactId).toBeUndefined()
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
