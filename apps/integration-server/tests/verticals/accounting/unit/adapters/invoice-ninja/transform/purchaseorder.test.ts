import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type InvoiceNinjaPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePurchaseOrder(
  overrides: Partial<InvoiceNinjaPurchaseOrder> = {},
): InvoiceNinjaPurchaseOrder {
  return {
    id: 'po-1',
    status_id: 2,
    number: 'PO-001',
    vendor_id: 'vendor-88',
    amount: 7500,
    balance: 7500,
    currency_id: '9', // CAD
    date: '2024-03-10',
    due_date: '2024-04-10',
    public_notes: 'Quarterly supplies order',
    line_items: [
      {
        product_key: 'PART-A',
        notes: 'Fasteners',
        cost: 75,
        quantity: 100,
        discount: 0,
        line_total: 7500,
      },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps status_id=1 to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 1 })).status).toBe('DRAFT')
  })

  it('maps status_id=2 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 2 })).status).toBe('ACTIVE')
  })

  it('maps status_id=3 to ACTIVE (accepted)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 3 })).status).toBe('ACTIVE')
  })

  it('maps status_id=4 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 4 })).status).toBe('COMPLETED')
  })

  it('maps status_id=5 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 5 })).status).toBe('CANCELLED')
  })

  it('defaults to DRAFT for null status_id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: null })).status).toBe('DRAFT')
  })

  it('defaults to ACTIVE for unknown status_id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status_id: 99 })).status).toBe('ACTIVE')
  })

  it('maps contactId from vendor_id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('vendor-88')
  })

  it('returns undefined contactId when vendor_id is absent', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ vendor_id: null })).contactId).toBeUndefined()
  })

  it('maps currency_id=9 to CAD', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('CAD')
  })

  it('maps totalAmount from amount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(7500)
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('PART-A')
    expect(li.itemDescription).toBe('Fasteners')
    expect(li.unitAmount).toBe(75)
    expect(li.unitQuantity).toBe(100)
    expect(li.totalAmount).toBe(7500)
  })

  it('returns empty lineItems when line_items is null', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ line_items: null })).lineItems).toEqual([])
  })

  it('maps postedAt from date string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).createdAt).toEqual(
      new Date(1700000000 * 1000),
    )
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).updatedAt).toEqual(
      new Date(1700100000 * 1000),
    )
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema validation', () => {
    expect(() =>
      PurchaseOrderSchema.parse(transformPurchaseOrder(makePurchaseOrder())),
    ).not.toThrow()
  })
})
