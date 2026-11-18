import type { StockTransfer, StockTransferLine } from '../../../schema/stock-transfer'
import type { StockTransferStatus } from '../../../schema/shared'
import { many2oneId, meta, odooIso, strOrUndef, type Many2one } from '../values'

/**
 * A `stock.picking` row (addons/stock/models/stock_picking.py, 19.0):
 *   name = fields.Char(
 *   origin = fields.Char(
 *   state = fields.Selection([('draft', 'Draft'), ('waiting', 'Waiting Another Operation'),
 *     ('confirmed', 'Waiting'), ('assigned', 'Ready'), ('done', 'Done'), ('cancel', 'Cancelled')], …)
 *   scheduled_date = fields.Datetime(
 *   date_done = fields.Datetime('Date of Transfer', copy=False, help="Date at which the transfer has been processed or cancelled.")
 *   location_id = fields.Many2one(
 *   location_dest_id = fields.Many2one(
 *   picking_type_code = fields.Selection(related='picking_type_id.code', readonly=True)
 * where stock.picking.type has
 *   code = fields.Selection([('incoming', 'Receipt'), ('outgoing', 'Delivery'),
 *     ('internal', 'Internal Transfer')], 'Type of Operation', …)
 */
export interface RawOdooPicking {
  id: number
  name?: string | false
  origin?: string | false
  state?: string | false
  scheduled_date?: string | false
  date_done?: string | false
  location_id?: Many2one
  location_dest_id?: Many2one
  picking_type_code?: string | false
}

export const PICKING_FIELDS = [
  'id',
  'name',
  'origin',
  'state',
  'scheduled_date',
  'date_done',
  'location_id',
  'location_dest_id',
  'picking_type_code',
]

/**
 * A `stock.move` row (addons/stock/models/stock_move.py, 19.0):
 *   product_id = fields.Many2one('product.product', 'Product', …)
 *   product_uom_qty = fields.Float('Demand', …, help="This is the quantity of product that is planned to be moved.")
 *   quantity = fields.Float('Quantity', compute='_compute_quantity', …)
 *   picking_id = fields.Many2one('stock.picking', 'Transfer', index=True, check_company=True)
 * `quantity` is new in 17.0 (stock_move.py:158); 14.0–16.0 have instead
 *   quantity_done = fields.Float('Quantity Done', compute='_quantity_done_compute', …)
 * (14.0 stock_move.py:161, 16.0:160). Both are asked for; the shared client
 * sends only the ones the server's fields_get reports.
 *
 * Quantities are in the move's own unit of measure and are not normalised:
 *   product_uom = fields.Many2one('uom.uom', 'Unit of Measure', required=True, …)
 * (14.0 stock_move.py:70). The canonical line has no unit field.
 */
export interface RawOdooMove {
  id: number
  picking_id?: Many2one | readonly [number, string]
  product_id?: Many2one | readonly [number, string]
  product_uom_qty?: number | false
  quantity?: number | false
  quantity_done?: number | false
}

export const MOVE_FIELDS = [
  'id',
  'picking_id',
  'product_id',
  'product_uom_qty',
  'quantity',
  'quantity_done',
]

/** `quantity` (17.0+) or `quantity_done` (14.0–16.0), whichever the server has. */
function doneQuantity(m: RawOdooMove): number | undefined {
  if (typeof m.quantity === 'number') return m.quantity
  if (typeof m.quantity_done === 'number') return m.quantity_done
  return undefined
}

/**
 * waiting / confirmed / assigned are confirmed transfers not yet processed;
 * the canonical set has no "confirmed", so they are in_transit. The Odoo state
 * is kept in metadata.odooState.
 */
const STATE: Record<string, StockTransferStatus> = {
  draft: 'draft',
  waiting: 'in_transit',
  confirmed: 'in_transit',
  assigned: 'in_transit',
  done: 'completed',
  cancel: 'cancelled',
}

export function transformStockTransfer(
  raw: RawOdooPicking,
  moves: readonly RawOdooMove[],
): StockTransfer {
  const state = strOrUndef(raw.state)
  const done = state === 'done'
  const lines: StockTransferLine[] = []
  for (const m of moves) {
    const productId = many2oneId(m.product_id as Many2one)
    if (!productId) continue
    const received = done ? doneQuantity(m) : undefined
    lines.push({
      productId,
      quantity: typeof m.product_uom_qty === 'number' ? m.product_uom_qty : 0,
      ...(received !== undefined ? { quantityReceived: received } : {}),
    })
  }
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: strOrUndef(raw.name),
    fromLocationId: many2oneId(raw.location_id) ?? '',
    toLocationId: many2oneId(raw.location_dest_id) ?? '',
    status: (state && STATE[state]) || 'unknown',
    lines,
    // date_done is set on cancel too ("processed or cancelled"), so only a done picking was received.
    receivedAt: done ? odooIso(raw.date_done) : undefined,
    platform: 'odoo-inventory',
    metadata: meta({
      odooState: state,
      origin: strOrUndef(raw.origin),
      scheduledAt: odooIso(raw.scheduled_date),
    }),
    raw,
  }
}
