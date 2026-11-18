/**
 * Fixture from the Purchase example selection and "Available fields" of
 * https://erplain.readme.io/v2.0/reference/purchases-queries, line items from
 * /v2.0/reference/line-items-queries, Date "YYYY-MM-DD" from /v2.0/reference/data-types.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawErplainPurchase,
} from '../../../../../../../src/verticals/inventory/adapters/erplain/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const raw: RawErplainPurchase = {
  id: 700001,
  label: 'PO-00042',
  status: 'active',
  delivery_status: 'not_delivered',
  dated_at: '2026-01-15',
  shipping_at: '2026-02-01',
  created_at: '2026-01-15 09:30:00',
  subtotal: 1250.5,
  total: 1500.6,
  location_label: 'Main Warehouse',
  currency: { label: 'EUR' },
  supplier: { id: 100002 },
  line_items: [
    { id: 1, quantity: 10, variant: { id: 5001, product: { id: 100050 } } },
    { id: 2, quantity: 2.5, variant: { id: 5002, product: { id: 100051 } } },
  ],
}

describe('erplain transformPurchaseOrder', () => {
  it('parses against the canonical PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const po = PurchaseOrderSchema.parse(transformPurchaseOrder(raw))
    expect(po.id).toBe('700001')
    expect(po.externalId).toBe('700001')
    expect(po.number).toBe('PO-00042')
    expect(po.supplierId).toBe('100002')
    expect(po.status).toBe('sent')
    expect(po.currency).toBe('EUR')
    expect(po.subtotalAmount).toBe(1250.5)
    expect(po.totalAmount).toBe(1500.6)
    expect(po.destinationLocationId).toBeUndefined()
    expect(po.lines).toEqual([
      { productId: '100050', quantityOrdered: 10 },
      { productId: '100051', quantityOrdered: 2.5 },
    ])
    expect(po.metadata).toMatchObject({
      dated_at: '2026-01-15',
      shipping_at: '2026-02-01',
      created_at: '2026-01-15 09:30:00',
      location_label: 'Main Warehouse',
    })
    expect(po.orderedAt).toBeUndefined()
    expect(po.expectedAt).toBeUndefined()
  })

  it.each([
    ['unpublished', 'not_delivered', 'draft'],
    ['draft', 'not_delivered', 'draft'],
    ['validation', 'not_delivered', 'unknown'],
    ['rejected', 'not_delivered', 'unknown'],
    ['active', 'not_delivered', 'sent'],
    ['active', 'partially_delivered', 'partially_received'],
    ['active', 'delivered', 'received'],
    ['completed', 'delivered', 'received'],
    ['archived', 'delivered', 'closed'],
    ['cancelled', 'not_delivered', 'cancelled'],
  ])('maps PurchaseStatus %s / %s to %s', (status, delivery, expected) => {
    const po = transformPurchaseOrder({ ...raw, status, delivery_status: delivery })
    expect(PurchaseOrderSchema.parse(po).status).toBe(expected)
  })

  it('omits a currency that is not an ISO code rather than failing the parse', () => {
    const po = transformPurchaseOrder({ ...raw, currency: { label: 'Euro' } })
    expect(() => PurchaseOrderSchema.parse(po)).not.toThrow()
    expect(po.currency).toBeUndefined()
  })

  it('throws instead of inventing a supplier, product or quantity', () => {
    expect(() => transformPurchaseOrder({ ...raw, supplier: null })).toThrow(/supplier/)
    expect(() =>
      transformPurchaseOrder({ ...raw, line_items: [{ id: 1, quantity: 1, variant: null }] }),
    ).toThrow(/variant\.product/)
    expect(() =>
      transformPurchaseOrder({
        ...raw,
        line_items: [{ id: 1, quantity: null, variant: { id: 1, product: { id: 2 } } }],
      }),
    ).toThrow(/quantity/)
  })
})
