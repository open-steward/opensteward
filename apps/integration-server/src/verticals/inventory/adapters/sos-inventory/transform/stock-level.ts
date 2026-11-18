/**
 * Derive a StockLevel record from a SOS Inventory item response.
 *
 * SOS Inventory v2 does not expose a dedicated stock-level endpoint.
 * On-hand quantities are embedded directly in the item object:
 *   onhand     — total units on hand across all locations
 *   available  — units available (onhand minus committed)
 *   onSO       — units committed to open sales orders
 *   onPO       — units on open purchase orders (incoming)
 *   reorderPoint
 *   maxStock
 *
 * When a `location` filter is applied to the GET /item call, these figures
 * reflect that specific location; otherwise they are account-wide totals.
 * The composite id encodes `itemId:locationId` (locationId = '' for totals).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawSosInventoryStockLevel {
  id: number | string
  onhand?: number
  available?: number
  onSO?: number
  onPO?: number
  onWO?: number
  onRMA?: number
  rented?: number
  reorderPoint?: number
  maxStock?: number
  /** Optional: locationId applied at query time — populated by the adapter */
  _locationId?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSosInventoryStockLevel): StockLevel {
  const productId = String(raw.id)
  const locationId = raw._locationId ?? ''

  return {
    id: locationId ? `${productId}:${locationId}` : productId,
    productId,
    locationId,
    quantityOnHand: raw.onhand ?? 0,
    quantityAvailable: raw.available,
    quantityCommitted: raw.onSO,
    quantityIncoming: raw.onPO,
    reorderPoint: raw.reorderPoint,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'sos-inventory',
    metadata: strMap({
      onWO: raw.onWO,
      onRMA: raw.onRMA,
      rented: raw.rented,
      maxStock: raw.maxStock,
    }),
    raw,
  }
}
