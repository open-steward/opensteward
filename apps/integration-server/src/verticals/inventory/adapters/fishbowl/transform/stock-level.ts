import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawFishbowlStockLevel {
  ProductID: string
  Location?: string
  LocationID?: string
  OnHand?: number
  Available?: number
  Allocated?: number
  OnOrder?: number
  StockOnHand?: number
  ReorderPoint?: number
  ReorderQty?: number
  LastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawFishbowlStockLevel): StockLevel {
  const locationId = raw.LocationID ?? raw.Location ?? ''
  return {
    id: `${raw.ProductID}:${locationId}`,
    productId: raw.ProductID,
    locationId,
    quantityOnHand: raw.OnHand ?? raw.StockOnHand ?? 0,
    quantityAvailable: raw.Available,
    quantityCommitted: raw.Allocated,
    quantityIncoming: raw.OnOrder,
    reorderPoint: raw.ReorderPoint,
    reorderQuantity: raw.ReorderQty,
    lastCountedAt: toIso(raw.LastCountDate),
    platform: 'fishbowl',
    metadata: strMap({}),
    raw,
  }
}
