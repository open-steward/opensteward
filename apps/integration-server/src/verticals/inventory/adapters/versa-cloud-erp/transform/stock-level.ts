/**
 * Versa Cloud ERP — stock level (inventory quantity) transform.
 *
 * API endpoint: GET /item.json?include_quantity=true  OR  GET /item/:id/quantity.json
 * The API embeds quantity fields directly on the item object or returns a
 * separate quantity record per location.
 *
 * Key response fields:
 *   item_id, location_id, location_name,
 *   quantity_on_hand, quantity_available, quantity_committed,
 *   quantity_on_order, reorder_point, reorder_quantity,
 *   last_count_date
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawVersaStockLevel {
  item_id: string | number
  location_id?: string | number
  location_name?: string
  quantity_on_hand?: number
  quantity_available?: number
  quantity_committed?: number
  quantity_on_order?: number
  reorder_point?: number
  reorder_quantity?: number
  last_count_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawVersaStockLevel): StockLevel {
  const itemId = String(raw.item_id)
  const locationId = raw.location_id != null ? String(raw.location_id) : ''

  return {
    id: `${itemId}:${locationId}`,
    productId: itemId,
    locationId,
    quantityOnHand: raw.quantity_on_hand ?? 0,
    quantityAvailable: raw.quantity_available,
    quantityCommitted: raw.quantity_committed,
    quantityIncoming: raw.quantity_on_order,
    reorderPoint: raw.reorder_point,
    reorderQuantity: raw.reorder_quantity,
    lastCountedAt: toIso(raw.last_count_date),
    platform: 'versa-cloud-erp',
    metadata: strMap({ location_name: raw.location_name }),
    raw,
  }
}
