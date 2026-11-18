import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Raw StockItem record from InvenTree GET /api/stock/
 * Source: InvenTree API schema v265, StockItem schema.
 *
 * Each StockItem represents a physical lot of a part at a location.
 * quantity = quantity on hand for that stock item lot.
 */
export interface RawInvenTreeStockItem {
  pk: number
  part: number                  // Part ID
  location: number | null       // StockLocation ID
  location_name?: string
  quantity: number              // quantity on hand
  allocated?: number            // quantity allocated (to build/sales orders)
  serial?: string | null        // serial number (trackable parts)
  batch?: string | null
  status?: number
  status_text?: string
  stocktake_date?: string | null
  updated?: string | null
  expiry_date?: string | null
  [key: string]: unknown
}

export function transformStockLevel(raw: RawInvenTreeStockItem): StockLevel {
  const id = String(raw.pk)
  const productId = String(raw.part)
  const locationId = raw.location != null ? String(raw.location) : ''
  return {
    id,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.quantity) ?? 0,
    quantityAvailable: raw.allocated != null ? Math.max(0, (pickNum(raw.quantity) ?? 0) - (pickNum(raw.allocated) ?? 0)) : undefined,
    quantityCommitted: pickNum(raw.allocated),
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.stocktake_date),
    platform: 'inventree',
    metadata: strMap({
      serial: raw.serial,
      batch: raw.batch,
      status: raw.status,
      statusText: raw.status_text,
      locationName: raw.location_name,
      expiryDate: raw.expiry_date,
    }),
    raw,
  }
}
