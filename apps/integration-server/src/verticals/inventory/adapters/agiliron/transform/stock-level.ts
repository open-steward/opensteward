import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Raw shape returned by GET /ProductsInventory in Agiliron API v4.0.
 *
 * Response envelope:
 *   { ProductsInventory: { StockLocationInventory: RawAgilironStockLevel[] }, TotalRecords, ... }
 *
 * Field reference: https://api.agiliron.com/docs/read-product-inventory
 */
export interface RawAgilironStockLevel {
  ProductCode: string
  StockLocation?: string
  BinLocation?: string
  QtyInStock?: number | string
  QtyOnPO?: number | string
  QtyOnSO?: number | string
  UnitCost?: number | string
  CreatedTime?: string
  ModifiedTime?: string
  ModifiedTimeUTC?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawAgilironStockLevel): StockLevel {
  const locationId = raw.StockLocation ?? ''
  // Composite ID: ProductCode + StockLocation (no separate stock-level ID in Agiliron)
  const id = `${raw.ProductCode}:${locationId}`

  const quantityOnHand = pickNum(raw.QtyInStock) ?? 0
  const quantityIncoming = pickNum(raw.QtyOnPO)
  const quantityCommitted = pickNum(raw.QtyOnSO)
  const quantityAvailable =
    quantityIncoming !== undefined || quantityCommitted !== undefined
      ? quantityOnHand - (quantityCommitted ?? 0)
      : undefined

  return {
    id,
    productId: raw.ProductCode,
    locationId,
    quantityOnHand,
    quantityAvailable,
    quantityCommitted,
    quantityIncoming,
    lastCountedAt: toIso(raw.ModifiedTimeUTC ?? raw.ModifiedTime),
    platform: 'agiliron',
    metadata: strMap({ binLocation: raw.BinLocation }),
    raw,
  }
}

/** Agiliron GET /ProductsInventory response envelope */
export interface AgilironInventoryEnvelope {
  ProductsInventory?: { StockLocationInventory?: RawAgilironStockLevel[] }
  TotalRecords?: number
  CurrentPage?: number
  TotalPages?: number
  PageSize?: number
}
