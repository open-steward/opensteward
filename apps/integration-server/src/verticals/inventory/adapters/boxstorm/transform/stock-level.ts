/**
 * Transform Boxstorm inventory record → canonical StockLevel.
 *
 * Boxstorm (Fishbowl Advanced) inventory search: GET /api/parts/inventory
 * Response envelope: { totalCount, totalPages, pageNumber, pageSize, results: RawBoxstormInventory[] }
 *
 * Each result represents a quantity-on-hand record for a part in a location.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawBoxstormInventory {
  /** Part identifier (integer) */
  id?: number | string
  partNumber?: string
  partDescription?: string
  /** Quantity on hand */
  quantity?: number
  /** Unit of measure */
  uom?: { id?: number | string; name?: string; abbreviation?: string }
  /** Location the quantity is held in */
  location?: string | { id?: number | string; name?: string }
  /** Tracking item details (serial / lot) */
  trackingItems?: unknown[]
  [key: string]: unknown
}

export function transformStockLevel(raw: RawBoxstormInventory): StockLevel {
  const partId = String(raw.id ?? raw.partNumber ?? '')
  const locationVal = raw.location
  const locationId = typeof locationVal === 'string'
    ? locationVal
    : locationVal
      ? String((locationVal as Record<string, unknown>).id ?? (locationVal as Record<string, unknown>).name ?? '')
      : ''

  return {
    id: `${partId}:${locationId}`,
    productId: partId,
    locationId,
    quantityOnHand: raw.quantity ?? 0,
    platform: 'boxstorm',
    metadata: strMap({
      partNumber: raw.partNumber,
      uom: raw.uom?.abbreviation ?? raw.uom?.name,
    }),
    raw,
  }
}
