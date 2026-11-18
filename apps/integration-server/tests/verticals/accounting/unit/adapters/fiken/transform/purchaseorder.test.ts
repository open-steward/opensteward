import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FikenPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FikenPurchaseOrder> = {}): FikenPurchaseOrder {
  return {
    purchaseOrderId: 55,
    identifier: 'PO-055',
    supplierId: 12,
    currency: 'NOK',
    net: 4000,
    vat: 1000,
    gross: 5000,
    date: '2024-01-15',
    status: 'active',
    lines: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (fiken)', () => {
  it('maps purchaseOrderId to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('55')
  })

  it('maps supplierId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('12')
  })

  it('maps gross to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(5000)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('NOK')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makePurchaseOrder({
      lines: [
        {
          netPrice: 400,
          vatAmount: 100,
          grossPrice: 500,
          description: 'Office supplies',
          accountCode: '6000',
          vatType: 'HIGH',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemDescription).toBe('Office supplies')
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(100)
    expect(li.accountId).toBe('6000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
