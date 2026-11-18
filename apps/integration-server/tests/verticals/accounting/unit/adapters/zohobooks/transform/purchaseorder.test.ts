import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type ZohoBooksPurchaseOrder,
  type ZohoBooksPurchaseOrderLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/purchaseorder'

function makePurchaseOrderLineItem(overrides: Partial<ZohoBooksPurchaseOrderLineItem> = {}): ZohoBooksPurchaseOrderLineItem {
  return {
    line_item_id: 'li-1',
    item_id: 'item-3',
    description: 'Raw Materials',
    rate: 80,
    quantity: 100,
    item_total: 8000,
    tax_amount: 800,
    account_id: 'acct-50',
    ...overrides,
  }
}

function makePurchaseOrder(overrides: Partial<ZohoBooksPurchaseOrder> = {}): ZohoBooksPurchaseOrder {
  return {
    purchaseorder_id: 'po-001',
    purchaseorder_number: 'PO-2024-001',
    vendor_id: 'vendor-22',
    date: '2024-08-01',
    delivery_date: '2024-08-15',
    currency_code: 'EUR',
    total: 8800,
    tax_total: 800,
    status: 'issued',
    line_items: [makePurchaseOrderLineItem()],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps purchaseorder_id to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-001')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-22')
  })

  it('maps currency_code to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(8800)
  })

  it('parses date as postedAt Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status issued to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'issued' })).status).toBe('ACTIVE')
  })

  it('maps status billed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'billed' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps line_items to lineItems', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Raw Materials')
    expect(result.lineItems![0].unitQuantity).toBe(100)
    expect(result.lineItems![0].totalAmount).toBe(8000)
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
