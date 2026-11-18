import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * Listing Mirror v3 inventory object.
 * GET /v3/inventory/ returns an array of { sku, quantity } records.
 * There is no per-location breakdown; inventory is account-wide per SKU.
 */
export interface RawListingMirrorInventory {
  sku?: string
  quantity?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawListingMirrorInventory): StockLevel {
  const sku = String(raw.sku ?? '')
  return {
    id: sku,
    productId: sku,
    locationId: 'default',
    quantityOnHand: raw.quantity ?? 0,
    platform: 'listing-mirror',
    metadata: strMap({}),
    raw,
  }
}
