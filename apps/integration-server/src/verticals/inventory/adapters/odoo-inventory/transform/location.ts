import type { Location } from '../../../schema/location'
import type { LocationType } from '../../../schema/shared'
import { many2oneId, meta, strOrUndef, type Many2one } from '../values'

/**
 * A `stock.location` row (addons/stock/models/stock_location.py, 19.0):
 *   name = fields.Char('Location Name', required=True)
 *   complete_name = fields.Char("Full Location Name", compute='_compute_complete_name', recursive=True, store=True)
 *   active = fields.Boolean('Active', default=True, …)
 *   usage = fields.Selection([('supplier', 'Vendor'), ('view', 'Virtual'),
 *     ('internal', 'Internal'), ('customer', 'Customer'), ('inventory', 'Inventory Loss'),
 *     ('production', 'Production'), ('transit', 'Transit')], string='Location Type', …)
 *   location_id = fields.Many2one('stock.location', 'Parent Location', …)
 *   warehouse_id = fields.Many2one('stock.warehouse', compute='_compute_warehouse_id', store=True)
 *     (new in 15.0, stock_location.py:91; on 14.0 fields_get omits it and warehouseId is absent)
 *   barcode = fields.Char('Barcode', copy=False)
 */
export interface RawOdooLocation {
  id: number
  name?: string | false
  complete_name?: string | false
  usage?: string | false
  location_id?: Many2one
  active?: boolean
  warehouse_id?: Many2one
  barcode?: string | false
}

export const LOCATION_FIELDS = [
  'id',
  'name',
  'complete_name',
  'usage',
  'location_id',
  'active',
  'warehouse_id',
  'barcode',
]

/**
 * usage → canonical type. The help text: "Internal: Physical locations inside
 * your warehouses"; "Transit: Counterpart location that should be used for
 * inter-company or inter-warehouses operations"; "Vendor: Virtual location
 * representing the source location for products coming from your vendors";
 * view, customer, inventory and production are each described as a
 * "Virtual" or "counterpart" location.
 */
const USAGE: Record<string, LocationType> = {
  internal: 'warehouse',
  transit: 'transit',
  supplier: 'supplier',
  view: 'virtual',
  customer: 'virtual',
  inventory: 'virtual',
  production: 'virtual',
}

export function transformLocation(raw: RawOdooLocation): Location {
  const usage = strOrUndef(raw.usage)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: strOrUndef(raw.complete_name) ?? strOrUndef(raw.name) ?? '',
    type: (usage && USAGE[usage]) || 'unknown',
    parentLocationId: many2oneId(raw.location_id),
    isActive: raw.active === true,
    platform: 'odoo-inventory',
    metadata: meta({
      usage,
      warehouseId: many2oneId(raw.warehouse_id),
      barcode: strOrUndef(raw.barcode),
    }),
    raw,
  }
}
