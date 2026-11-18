import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type TripletexPurchaseOrder,
  type TripletexPurchaseOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/purchaseorder'

function makePurchaseOrderLine(overrides: Partial<TripletexPurchaseOrderLine> = {}): TripletexPurchaseOrderLine {
  return {
    id: 1,
    description: 'Office Supplies',
    count: 10,
    unitPriceExcludingVat: 50,
    amountExcludingVat: 500,
    product: { id: 5, name: 'Office Supplies' },
    ...overrides,
  }
}

function makePurchaseOrder(overrides: Partial<TripletexPurchaseOrder> = {}): TripletexPurchaseOrder {
  return {
    id: 606,
    orderDate: '2024-08-01',
    supplier: { id: 33, name: 'Nordic Supplies AS' },
    amount: 6250,
    currency: { id: '1', code: 'NOK' },
    isClosed: false,
    orderLines: [makePurchaseOrderLine()],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('606')
  })

  it('maps supplier id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('33')
  })

  it('maps currency code correctly', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(6250)
  })

  it('parses orderDate as postedAt Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps isClosed false to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ isClosed: false })).status).toBe('ACTIVE')
  })

  it('maps isClosed true to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ isClosed: true })).status).toBe('COMPLETED')
  })

  it('maps orderLines to lineItems', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemDescription).toBe('Office Supplies')
    expect(result.lineItems?.[0].unitQuantity).toBe(10)
    expect(result.lineItems?.[0].totalAmount).toBe(500)
  })

  it('produces empty lineItems when orderLines is absent', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ orderLines: undefined }))
    expect(result.lineItems).toHaveLength(0)
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
