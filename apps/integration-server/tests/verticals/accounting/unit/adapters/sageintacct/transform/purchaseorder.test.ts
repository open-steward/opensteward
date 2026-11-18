import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type IntacctPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<IntacctPurchaseOrder> = {}): IntacctPurchaseOrder {
  return {
    RECORDNO: 'po-1',
    DOCID: 'PO-2024-001',
    VENDORID: 'vendor-1',
    WHENORDERED: '2024-03-01',
    WHENDUE: '2024-04-01',
    CURRENCY: 'USD',
    TOTAL: '3000.00',
    STATE: 'Pending',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps RECORDNO to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps VENDORID to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-1')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('USD')
  })

  it('parses TOTAL as totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(3000)
  })

  it('parses WHENORDERED as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps STATE Draft to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ STATE: 'Draft' })).status).toBe('ACTIVE')
  })

  it('maps STATE Pending to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ STATE: 'Pending' })).status).toBe('ACTIVE')
  })

  it('maps STATE Closed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ STATE: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps STATE Cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ STATE: 'Cancelled' })).status).toBe('CANCELLED')
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
