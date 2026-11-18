/**
 * EZO stock-level (quantity by location) transform.
 *
 * EZO exposes per-inventory-item quantity-by-location via:
 *   GET /api/v2/inventory/:id/get_quantity_by_location
 *   → { quantity: [ { location_id, location_name, quantity, ... } ] }
 *
 * For bulk listing we iterate inventories and attach location data from the
 * root inventory record when the per-location endpoint is not called.
 *
 * Raw response fields:
 *   inventory_id (injected by adapter), location_id, location_name,
 *   quantity, minimum_quantity (reorder point), optimal_quantity
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawEZOStockLevel {
  /** injected by adapter from the parent inventory item id */
  inventory_id: number | string
  location_id?: number | string
  location_name?: string
  quantity?: number | string
  minimum_quantity?: number | string
  optimal_quantity?: number | string
  updated_at?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawEZOStockLevel): StockLevel {
  const productId = String(raw.inventory_id)
  const locationId = String(raw.location_id ?? '')
  const qty = raw.quantity !== undefined ? Number(raw.quantity) : 0

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: isNaN(qty) ? 0 : qty,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: raw.minimum_quantity !== undefined ? Number(raw.minimum_quantity) : undefined,
    reorderQuantity: raw.optimal_quantity !== undefined ? Number(raw.optimal_quantity) : undefined,
    lastCountedAt: toIso(raw.updated_at),
    platform: 'ezofficeinventory',
    metadata: strMap({ locationName: raw.location_name }),
    raw,
  }
}
