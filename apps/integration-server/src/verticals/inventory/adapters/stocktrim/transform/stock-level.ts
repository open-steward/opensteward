import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

/**
 * Shape of inventory entries derived from GET /api/Products stockLocations
 * array (each element carries locationCode + locationName + stockOnHand +
 * stockOnOrder per the official StockTrim API schema), and also from
 * POST /api/Inventory Inventory objects (same field set).
 */
export interface RawStockTrimStockLevel {
  /** Product identifier */
  productId: string
  /** Location code (locationCode in stockLocations / Inventory) */
  locationCode?: string
  /** Location display name */
  locationName?: string
  /** Quantity physically on hand */
  stockOnHand?: number
  /** Quantity on open purchase orders */
  stockOnOrder?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawStockTrimStockLevel): StockLevel {
  const locationId = typeof raw.locationCode === 'string' && raw.locationCode
    ? raw.locationCode
    : typeof raw.locationName === 'string' && raw.locationName
      ? raw.locationName
      : ''
  const syntheticId = `${raw.productId}:${locationId}`
  return {
    id: syntheticId,
    externalId: syntheticId,
    productId: raw.productId,
    locationId,
    quantityOnHand: pickNum(raw.stockOnHand) ?? 0,
    quantityIncoming: pickNum(raw.stockOnOrder),
    platform: 'stocktrim',
    metadata: strMap({ locationName: raw.locationName }),
    raw,
  }
}
