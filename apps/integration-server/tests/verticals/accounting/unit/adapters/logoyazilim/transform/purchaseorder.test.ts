import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type LogoPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<LogoPurchaseOrder> = {}): LogoPurchaseOrder {
  return {
    id: '1100',
    Date: '2024-08-01',
    Status: 'Active',
    ContactId: '88',
    TotalAmount: 6000,
    ...overrides,
  }
}

describe('transformPurchaseOrder (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('1100')
  })

  it('maps totalAmount and contactId', () => {
    const po = transformPurchaseOrder(makePurchaseOrder())
    expect(po.totalAmount).toBe(6000)
    expect(po.contactId).toBe('88')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Completed status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('parses date as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoPurchaseOrder = { id: '9999' }
    const po = transformPurchaseOrder(raw)
    expect(po.id).toBe('9999')
    expect(po.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
