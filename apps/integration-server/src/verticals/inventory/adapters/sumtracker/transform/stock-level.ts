import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Sumtracker inventory/stock level object as returned by GET /inventory
 * or GET /products/:id/inventory.
 */
export interface RawSumtrackerStockLevel {
  product_id: string | number
  warehouse_id?: string | number
  warehouse_name?: string
  physical_stock?: number
  booked_stock?: number
  available_stock?: number
  incoming_stock?: number
  reorder_point?: number
  reorder_qty?: number
  last_count_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSumtrackerStockLevel): StockLevel {
  const productId = String(raw.product_id)
  const locationId = raw.warehouse_id !== undefined ? String(raw.warehouse_id) : (raw.warehouse_name ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.physical_stock) ?? 0,
    quantityAvailable: pickNum(raw.available_stock),
    quantityCommitted: pickNum(raw.booked_stock),
    quantityIncoming: pickNum(raw.incoming_stock),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_qty),
    lastCountedAt: toIso(raw.last_count_date),
    platform: 'sumtracker',
    metadata: strMap({ warehouse_name: raw.warehouse_name }),
    raw,
  }
}
