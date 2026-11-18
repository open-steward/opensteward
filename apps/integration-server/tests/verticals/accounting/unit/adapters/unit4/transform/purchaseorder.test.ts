import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type Unit4PurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<Unit4PurchaseOrder> = {}): Unit4PurchaseOrder {
  return {
    purchaseOrderId: 'po_001',
    orderNumber: 'PO-2024-001',
    status: 'Draft',
    supplierId: 'supp_15',
    amount: 5500,
    currencyCode: 'EUR',
    orderDate: '2024-03-08',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Unit4)', () => {
  it('maps purchaseOrderId to string id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ purchaseOrderId: 'po_001' })).id).toBe('po_001')
  })

  it('maps numeric purchaseOrderId to string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ purchaseOrderId: 22 })).id).toBe('22')
  })

  it('maps amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ amount: 7000 })).totalAmount).toBe(7000)
  })

  it('maps supplierId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ supplierId: 'supp_77' })).contactId).toBe('supp_77')
  })

  it('maps currencyCode to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ currencyCode: 'GBP' })).currency).toBe('GBP')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Active status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Active' })).status).toBe('ACTIVE')
  })

  it('maps Approved status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Approved' })).status).toBe('ACTIVE')
  })

  it('maps Received status to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Received' })).status).toBe('COMPLETED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('parses orderDate as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ orderDate: '2024-03-08' })).postedAt).toEqual(new Date('2024-03-08'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ purchaseOrderId: 'po_001' }))
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
