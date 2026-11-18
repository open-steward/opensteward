import type { PurchaseOrder, PurchaseOrderLine } from '../../../schema/purchase-order'
import type { PurchaseOrderStatus } from '../../../schema/shared'
import {
  currencyCode,
  many2oneId,
  meta,
  minor,
  odooIso,
  strOrUndef,
  type Many2one,
} from '../values'

/**
 * A `purchase.order` row (addons/purchase/models/purchase_order.py, 19.0):
 *   name = fields.Char('Order Reference', required=True, …)
 *   partner_ref = fields.Char('Vendor Reference', copy=False, …)
 *   date_order = fields.Datetime('Order Deadline', required=True, …)
 *   date_approve = fields.Datetime('Confirmation Date', readonly=True, index=True, copy=False)
 *   partner_id = fields.Many2one('res.partner', string='Vendor', required=True, …)
 *   currency_id = fields.Many2one('res.currency', 'Currency', required=True, …)
 *   state = fields.Selection([('draft', 'RFQ'), ('sent', 'RFQ Sent'), ('to approve', 'To Approve'),
 *     ('purchase', 'Purchase Order'), ('cancel', 'Cancelled')], …)
 * 14.0–18.0 also have ('done', 'Locked') (14.0 purchase.py:100, 18.0
 * purchase_order.py:104), set by button_done and undone by
 *   def button_unlock(self):
 *       self.write({'state': 'purchase'})
 * so a Locked order is a confirmed one. Also:
 *   date_planned = fields.Datetime(string='Expected Arrival', …)
 *   amount_untaxed = fields.Monetary(string='Untaxed Amount', …)
 *   amount_total = fields.Monetary(string='Total', …)
 */
export interface RawOdooPurchaseOrder {
  id: number
  name?: string | false
  partner_id?: Many2one
  partner_ref?: string | false
  state?: string | false
  currency_id?: Many2one
  amount_untaxed?: number | false
  amount_total?: number | false
  date_order?: string | false
  date_approve?: string | false
  date_planned?: string | false
}

export const PURCHASE_ORDER_FIELDS = [
  'id',
  'name',
  'partner_id',
  'partner_ref',
  'state',
  'currency_id',
  'amount_untaxed',
  'amount_total',
  'date_order',
  'date_approve',
  'date_planned',
]

/**
 * A `purchase.order.line` row (addons/purchase/models/purchase_order_line.py, 19.0):
 *   order_id = fields.Many2one('purchase.order', string='Order Reference', …)
 *   product_id = fields.Many2one('product.product', string='Product', …)
 *   product_qty = fields.Float(string='Quantity', digits='Product Unit', required=True)
 *   qty_received = fields.Float("Received Qty", …)
 *   price_unit = fields.Float(string='Unit Price', required=True, …)
 *   price_subtotal = fields.Monetary(compute='_compute_amount', string='Subtotal', store=True)
 *   display_type = fields.Selection([('line_section', "Section"), ('line_subsection', "Subsection"),
 *     ('line_note', "Note")], default=False, help="Technical field for UX purpose.")
 *
 * Units: product_qty and qty_received are passed through in the line's own unit
 * of measure (`product_uom_id` in 19.0; `product_uom = fields.Many2one('uom.uom',
 * string='Unit of Measure', …)` in 14.0–18.0, 18.0 purchase_order_line.py:41),
 * not converted to the product's: the canonical line has no unit field. The
 * received/partial status compares two quantities of the same line.
 *
 * Money: price_unit is a plain Float, stored without a currency precision
 * (min_display_digits='Product Price'), while the canonical unitCost is an
 * integer in the currency's minor units, so a unit price finer than the minor
 * unit is rounded (0.0045 EUR → 0). lineTotal is the Monetary price_subtotal,
 * not unitCost × quantity, so the two can disagree by that rounding.
 */
export interface RawOdooPurchaseLine {
  id: number
  order_id?: Many2one
  product_id?: Many2one
  product_qty?: number | false
  qty_received?: number | false
  price_unit?: number | false
  price_subtotal?: number | false
  display_type?: string | false
}

export const PURCHASE_LINE_FIELDS = [
  'id',
  'order_id',
  'product_id',
  'product_qty',
  'qty_received',
  'price_unit',
  'price_subtotal',
  'display_type',
]

const num = (v: number | false | undefined): number => (typeof v === 'number' ? v : 0)

/**
 * draft / sent / cancel map by name; 'to approve' is an RFQ awaiting internal
 * approval, not yet an order, so draft. A 'purchase' (confirmed) or 'done' (Locked) order is
 * received, partially received or sent by its lines' qty_received.
 */
function status(state: string | undefined, lines: PurchaseOrderLine[]): PurchaseOrderStatus {
  switch (state) {
    case 'draft':
    case 'to approve':
      return 'draft'
    case 'sent':
      return 'sent'
    case 'cancel':
      return 'cancelled'
    case 'purchase':
    case 'done': {
      const received = lines.map((l) => l.quantityReceived ?? 0)
      if (lines.length > 0 && lines.every((l, i) => received[i]! >= l.quantityOrdered))
        return 'received'
      if (received.some((q) => q > 0)) return 'partially_received'
      return 'sent'
    }
    default:
      return 'unknown'
  }
}

export function transformPurchaseOrder(
  raw: RawOdooPurchaseOrder,
  rawLines: readonly RawOdooPurchaseLine[],
): PurchaseOrder {
  const currency = currencyCode(raw.currency_id)
  const lines: PurchaseOrderLine[] = []
  for (const l of rawLines) {
    const productId = many2oneId(l.product_id)
    // Section and note lines (display_type set) carry no product; the list domain
    // already excludes them.
    if (!productId) continue
    lines.push({
      productId,
      quantityOrdered: num(l.product_qty),
      quantityReceived: num(l.qty_received),
      unitCost: minor(l.price_unit, currency),
      lineTotal: minor(l.price_subtotal, currency),
    })
  }
  const state = strOrUndef(raw.state)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: strOrUndef(raw.name),
    supplierId: many2oneId(raw.partner_id) ?? '',
    status: status(state, lines),
    currency,
    subtotalAmount: minor(raw.amount_untaxed, currency),
    totalAmount: minor(raw.amount_total, currency),
    lines,
    expectedAt: odooIso(raw.date_planned),
    orderedAt: odooIso(raw.date_approve),
    platform: 'odoo-inventory',
    metadata: meta({
      odooState: state,
      vendorReference: strOrUndef(raw.partner_ref),
      orderDeadline: odooIso(raw.date_order),
    }),
    raw,
  }
}
