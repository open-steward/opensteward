/**
 * TrueCommerce stock-level transform.
 *
 * Maps GET /v1/inventory response fields:
 *   item_id, location_id, location_name, qty_on_hand, qty_available,
 *   qty_committed, qty_on_order, reorder_point, reorder_qty, last_count_date
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawTruecommerceStockLevel {
  item_id: string
  location_id?: string
  location_name?: string
  qty_on_hand?: number
  qty_available?: number
  qty_committed?: number
  qty_on_order?: number
  reorder_point?: number
  reorder_qty?: number
  last_count_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawTruecommerceStockLevel): StockLevel {
  const locationId = raw.location_id ?? ''
  return {
    id: `${raw.item_id}:${locationId}`,
    productId: raw.item_id,
    locationId,
    quantityOnHand: raw.qty_on_hand ?? 0,
    quantityAvailable: raw.qty_available,
    quantityCommitted: raw.qty_committed,
    quantityIncoming: raw.qty_on_order,
    reorderPoint: raw.reorder_point,
    reorderQuantity: raw.reorder_qty,
    lastCountedAt: toIso(raw.last_count_date),
    platform: 'truecommerce',
    metadata: strMap({ locationName: raw.location_name }),
    raw,
  }
}
