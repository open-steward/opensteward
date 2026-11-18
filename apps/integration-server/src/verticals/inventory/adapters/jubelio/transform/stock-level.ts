/**
 * Jubelio stock-level (inventory on-hand) transform.
 *
 * GET /inventory/   → {data: RawJubelioStockLevel[], count: number}
 *
 * Each row represents one product × one location snapshot.
 * Fields sourced from Jubelio API reference (inventory listing).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawJubelioStockLevel {
  item_id: number | string
  location_id?: number | string
  location_name?: string
  quantity?: number | string
  available?: number | string
  committed?: number | string
  incoming?: number | string
  reorder_point?: number | string
  reorder_qty?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawJubelioStockLevel): StockLevel {
  const productId = String(raw.item_id)
  const locationId = raw.location_id != null ? String(raw.location_id) : ''
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.quantity) ?? 0,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: pickNum(raw.committed),
    quantityIncoming: pickNum(raw.incoming),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_qty),
    lastCountedAt: undefined,
    platform: 'jubelio',
    metadata: strMap({ locationName: raw.location_name }),
    raw,
  }
}
