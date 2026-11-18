/**
 * purchase.order and purchase.order.line rows; fields from
 * addons/purchase/models/purchase_order.py and purchase_order_line.py, 19.0.
 */
import { describe, expect, it } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'
import {
  transformPurchaseOrder,
  type RawOdooPurchaseOrder,
  type RawOdooPurchaseLine,
} from '../../../../../../../src/verticals/inventory/adapters/odoo-inventory/transform/purchase-order'

const order = (state: string): RawOdooPurchaseOrder => ({
  id: 9,
  name: 'P00009',
  partner_id: [14, 'Azure Interior'],
  partner_ref: 'SO-778',
  state,
  currency_id: [2, 'EUR'],
  amount_untaxed: 5000,
  amount_total: 6050,
  date_order: '2026-01-10 08:00:00',
  date_approve: state === 'purchase' ? '2026-01-11 08:00:00' : false,
  date_planned: '2026-02-01 12:00:00',
})

const line = (id: number, product_qty: number, qty_received: number): RawOdooPurchaseLine => ({
  id,
  order_id: [9, 'P00009'],
  product_id: [42, 'Large Cabinet'],
  product_qty,
  qty_received,
  price_unit: 25,
  price_subtotal: 25 * product_qty,
  display_type: false,
})

describe('odoo-inventory transformPurchaseOrder', () => {
  it('maps a confirmed order, scaling money to minor units', () => {
    const po = PurchaseOrderSchema.parse(
      transformPurchaseOrder(order('purchase'), [line(1, 200, 0)]),
    )
    expect(po).toMatchObject({
      id: '9',
      externalId: '9',
      number: 'P00009',
      supplierId: '14',
      status: 'sent',
      currency: 'EUR',
      subtotalAmount: 500000,
      totalAmount: 605000,
      orderedAt: '2026-01-11T08:00:00.000Z',
      expectedAt: '2026-02-01T12:00:00.000Z',
      lines: [
        {
          productId: '42',
          quantityOrdered: 200,
          quantityReceived: 0,
          unitCost: 2500,
          lineTotal: 500000,
        },
      ],
    })
    expect(po.metadata).toMatchObject({ odooState: 'purchase', vendorReference: 'SO-778' })
  })

  it('a confirmed order is partially_received, then received, by qty_received', () => {
    expect(transformPurchaseOrder(order('purchase'), [line(1, 10, 4), line(2, 5, 0)]).status).toBe(
      'partially_received',
    )
    expect(transformPurchaseOrder(order('purchase'), [line(1, 10, 10), line(2, 5, 5)]).status).toBe(
      'received',
    )
  })

  it.each([
    ['draft', 'draft'],
    ['sent', 'sent'],
    ['to approve', 'draft'],
    ['cancel', 'cancelled'],
  ])('state %s is %s', (state, status) => {
    expect(
      PurchaseOrderSchema.parse(transformPurchaseOrder(order(state), [line(1, 1, 1)])).status,
    ).toBe(status)
  })

  it('drops section and note lines, which have no product', () => {
    const note: RawOdooPurchaseLine = {
      id: 3,
      order_id: [9, 'P00009'],
      product_id: false,
      product_qty: 0,
      qty_received: 0,
      price_unit: 0,
      price_subtotal: 0,
      display_type: 'line_note',
    }
    const po = PurchaseOrderSchema.parse(
      transformPurchaseOrder(order('draft'), [note, line(1, 2, 0)]),
    )
    expect(po.lines).toHaveLength(1)
  })
})

describe('odoo-inventory transformPurchaseOrder, Odoo 14–18 Locked and edge states', () => {
  // 14.0 purchase.py:100 and 18.0 purchase_order.py:104: ('done', 'Locked');
  // button_unlock: self.write({'state': 'purchase'}) — a Locked order is a confirmed one.
  it("maps a Locked ('done') order by its lines' qty_received, like a confirmed one", () => {
    expect(transformPurchaseOrder(order('done'), [line(1, 2, 2)]).status).toBe('received')
    expect(transformPurchaseOrder(order('done'), [line(1, 2, 1)]).status).toBe('partially_received')
    expect(transformPurchaseOrder(order('done'), [line(1, 2, 0)]).status).toBe('sent')
  })

  it('a confirmed order with no product lines is sent, not received', () => {
    expect(transformPurchaseOrder(order('purchase'), []).status).toBe('sent')
  })

  it('an undocumented state is unknown', () => {
    expect(transformPurchaseOrder(order('weird'), [line(1, 2, 2)]).status).toBe('unknown')
  })
})
