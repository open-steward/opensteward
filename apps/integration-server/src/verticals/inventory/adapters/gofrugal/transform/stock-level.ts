/**
 * GoFrugal RetailEasy stock-level transform.
 *
 * The /api/v1/items response embeds stock per location. A stock-level record
 * is synthesised for every (itemId, locationId) pair returned by the API.
 *
 * API response shape (per item):
 *   { itemId, itemName, locationId, stock: [{ stock, salePrice, mrp, itemReferenceCode, taxPercentage }] }
 *
 * The stock[] array can contain multiple entries when the item is active across
 * multiple batches/bins at the same location; we sum their quantities.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'
import type { RawGofrugalProduct } from './product'

/**
 * Flattened representation used internally before mapping to StockLevel.
 * Created by expanding each item × locationId from the /items list.
 */
export interface RawGofrugalStockLevel {
  itemId: number | string
  locationId: number | string
  totalOnHand: number
  _raw: RawGofrugalProduct
}

/**
 * Derive StockLevel records from a raw GoFrugal item. Each item carries its
 * locationId and a stock[] array; we fold the stock quantities into a single
 * on-hand total per (item, location).
 */
export function expandStockLevels(raw: RawGofrugalProduct): RawGofrugalStockLevel[] {
  const locationId = raw.locationId ?? 'unknown'
  const totalOnHand = (raw.stock ?? []).reduce((sum, s) => sum + (s.stock ?? 0), 0)
  return [{
    itemId: raw.itemId,
    locationId,
    totalOnHand,
    _raw: raw,
  }]
}

export function transformStockLevel(flat: RawGofrugalStockLevel): StockLevel {
  const productId = String(flat.itemId)
  const locationId = String(flat.locationId)
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: flat.totalOnHand,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'gofrugal',
    metadata: strMap({}),
    raw: flat._raw,
  }
}
