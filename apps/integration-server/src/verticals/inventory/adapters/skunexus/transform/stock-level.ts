import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Raw stock level (inventory) record from the SkuNexus REST API.
 * SkuNexus exposes five inventory buckets per product+location tuple:
 *   on_hand, assigned (committed), available, reserved, undecided (awaiting routing).
 * Endpoint: GET /api/v1/inventory  (list by location/product)
 */
export interface RawSkuNexusStockLevel {
  id?: string | number
  product_id: string | number
  location_id?: string | number
  warehouse_id?: string | number
  on_hand?: number | string
  available?: number | string
  assigned?: number | string
  reserved?: number | string
  undecided?: number | string
  on_order?: number | string
  reorder_point?: number | string
  reorder_quantity?: number | string
  last_counted_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSkuNexusStockLevel): StockLevel {
  const productId = String(raw.product_id)
  const locationId = String(raw.location_id ?? raw.warehouse_id ?? '')
  const onHand = pickNum(raw.on_hand) ?? 0
  const assigned = pickNum(raw.assigned)
  // committed = assigned + reserved in SkuNexus terminology
  const reserved = pickNum(raw.reserved) ?? 0
  const committed = assigned !== undefined ? assigned + reserved : undefined

  return {
    id: raw.id != null ? String(raw.id) : `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: committed,
    quantityIncoming: pickNum(raw.on_order),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_quantity),
    lastCountedAt: toIso(raw.last_counted_at) ?? toIso(raw.updated_at),
    platform: 'skunexus',
    metadata: strMap({ undecided: raw.undecided }),
    raw,
  }
}
