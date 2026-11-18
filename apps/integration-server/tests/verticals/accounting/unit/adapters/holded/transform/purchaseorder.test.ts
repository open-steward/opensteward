import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type HoldedPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/holded/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<HoldedPurchaseOrder> = {}): HoldedPurchaseOrder {
  return {
    id: 'holded-po-1',
    orderNum: '2024PO001',
    contact: 'supplier-3',
    currency: 'EUR',
    subtotal: 500,
    tax: 125,
    total: 625,
    items: [],
    date: 1705276800,
    status: 1,
    ...overrides,
  }
}

describe('transformPurchaseOrder (holded)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('holded-po-1')
  })

  it('maps contact to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('supplier-3')
  })

  it('maps total to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(625)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('converts unix timestamp to Date for postedAt', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date(1705276800 * 1000))
  })

  it('maps status 3 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 3 })).status).toBe('CANCELLED')
  })

  it('maps status 2 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps items to lineItems', () => {
    const raw = makePurchaseOrder({
      items: [
        {
          id: 'item-po-1',
          name: 'Raw material',
          description: 'Steel',
          units: 10,
          subtotal: 200,
          total: 240,
          tax: 40,
          accountId: 'acc-purchase',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('item-po-1')
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(240)
    expect(li.taxAmount).toBe(40)
    expect(li.accountId).toBe('acc-purchase')
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
