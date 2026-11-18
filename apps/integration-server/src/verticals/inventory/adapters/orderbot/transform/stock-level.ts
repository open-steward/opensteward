/**
 * Orderbot stock-level transform.
 *
 * The GET /inventory endpoint returns per-product inventory records,
 * optionally scoped to a distribution_center_id (Orderbot's term for location).
 *
 * Known fields from the Extensiv/workarea integration:
 *   product_id, sku, distribution_center_id, on_hand, available,
 *   committed/allocated, on_order, reorder_point.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawOrderbotInventory {
  product_id?: string | number
  sku?: string
  distribution_center_id?: string | number
  distribution_center?: string
  on_hand?: number | string
  available?: number | string
  committed?: number | string
  allocated?: number | string
  on_order?: number | string
  reorder_point?: number | string
  reorder_quantity?: number | string
  last_count_date?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawOrderbotInventory): StockLevel {
  const productId = String(raw.product_id ?? raw.sku ?? '')
  const locationId = String(raw.distribution_center_id ?? raw.distribution_center ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.on_hand) ?? 0,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: pickNum(raw.committed) ?? pickNum(raw.allocated),
    quantityIncoming: pickNum(raw.on_order),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_quantity),
    lastCountedAt: toIso(raw.last_count_date) ?? toIso(raw.updated_at),
    platform: 'orderbot',
    metadata: strMap({ sku: raw.sku }),
    raw,
  }
}
