/**
 * Lightspeed Retail (X-Series) inventory record transform.
 *
 * API endpoints:
 *   GET /api/2.0/inventory                        — all records paginated
 *   GET /api/2.0/products/{product_id}/inventory  — per-product records
 *
 * Docs: https://x-series-api.lightspeedhq.com/reference/listinventoryrecords
 *
 * Key fields (per inventory record):
 *   id               — UUID of the inventory record
 *   product_id       — UUID of the product (variant)
 *   outlet_id        — UUID of the outlet (store/warehouse)
 *   current_amount   — quantity on hand (decimal)
 *   reorder_point    — threshold for reorder trigger
 *   restock_level    — target quantity after restocking
 *   average_cost     — averaged cost (decimal)
 *   attributed_cost  — total attributed cost
 *   version          — monotonic cursor value
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawLightspeedInventoryRecord {
  id: string
  product_id: string
  outlet_id: string
  current_amount?: number | string
  reorder_point?: number | string
  restock_level?: number | string
  average_cost?: number | string
  attributed_cost?: number | string
  version?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawLightspeedInventoryRecord): StockLevel {
  return {
    id: raw.id,
    productId: raw.product_id,
    locationId: raw.outlet_id,
    quantityOnHand: pickNum(raw.current_amount) ?? 0,
    quantityAvailable: undefined, // X-Series does not expose a separate available figure
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.restock_level),
    lastCountedAt: undefined, // not available in the inventory record
    platform: 'lightspeed-inventory',
    metadata: strMap({
      averageCost: raw.average_cost,
      attributedCost: raw.attributed_cost,
    }),
    raw,
  }
}
