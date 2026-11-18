import type { StockLevel } from '../../../schema/stock-level'
import { many2oneId, many2oneName, meta, type Many2one } from '../values'

/**
 * A `stock.quant` row (addons/stock/models/stock_quant.py, 19.0):
 *   product_id = fields.Many2one('product.product', 'Product', …, required=True, …)
 *   location_id = fields.Many2one('stock.location', 'Location', …, required=True, …)
 *   warehouse_id = fields.Many2one('stock.warehouse', related='location_id.warehouse_id')
 *   lot_id = fields.Many2one('stock.lot', 'Lot/Serial Number', …)
 *   quantity = fields.Float('Quantity', help='Quantity of products in this quant, in the default unit of measure of the product', …)
 *   reserved_quantity = fields.Float('Reserved Quantity', …, help='Quantity of reserved products in this quant, …')
 *   available_quantity = fields.Float('Available Quantity', help="On hand quantity which hasn't been reserved on a transfer, …")
 *
 * A quant is one (product, location, lot, package, owner) record, and the stock
 * level's id is the quant's. That id is not permanent: Odoo unlinks "quants
 * with no quantity and no reserved_quantity" (_unlink_zero_quants) and merges
 * duplicates (_merge_quants) (stock_quant.py 19.0, lines 1123 and 1178), so a
 * level can vanish at zero, or reappear under another id after a merge.
 *
 * `quantity` is "in the default unit of measure of the product" (quoted above).
 * warehouse_id is new in 16.0 (stock_quant.py:72); on 14–15 fields_get does not
 * report it, the shared client leaves it out, and metadata.warehouseId is absent.
 */
export interface RawOdooQuant {
  id: number
  product_id?: Many2one
  location_id?: Many2one
  warehouse_id?: Many2one
  lot_id?: Many2one
  quantity?: number | false
  reserved_quantity?: number | false
  available_quantity?: number | false
}

export const QUANT_FIELDS = [
  'id',
  'product_id',
  'location_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'reserved_quantity',
  'available_quantity',
]

const num = (v: number | false | undefined): number | undefined =>
  typeof v === 'number' ? v : undefined

export function transformStockLevel(raw: RawOdooQuant): StockLevel {
  const productId = many2oneId(raw.product_id)
  const locationId = many2oneId(raw.location_id)
  if (!productId || !locationId) {
    throw new Error(`Odoo stock.quant ${raw.id} has no product_id or location_id`)
  }
  const onHand = num(raw.quantity) ?? 0
  const lot = many2oneName(raw.lot_id)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityCommitted: num(raw.reserved_quantity),
    quantityAvailable: num(raw.available_quantity),
    ...(lot ? { lots: [{ lot, quantity: onHand }] } : {}),
    platform: 'odoo-inventory',
    metadata: meta({ warehouseId: many2oneId(raw.warehouse_id) }),
    raw,
  }
}
