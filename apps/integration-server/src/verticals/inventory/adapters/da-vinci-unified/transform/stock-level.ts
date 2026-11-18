/**
 * Da Vinci Unified — inventory (stock level) transform.
 *
 * DVU API returns per-item-per-warehouse inventory snapshots from
 * /api/inventory/itemInventory. Key fields: itemId, warehouseId,
 * quantityOnHand, quantityAvailable, quantityAllocated, quantityOnOrder,
 * reorderPoint, reorderQuantity, lastCountDate.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawDaVinciUnifiedStockLevel {
  itemId: string
  warehouseId: string
  quantityOnHand?: number
  quantityAvailable?: number
  quantityAllocated?: number
  quantityOnOrder?: number
  reorderPoint?: number
  reorderQuantity?: number
  lastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawDaVinciUnifiedStockLevel): StockLevel {
  return {
    id: `${raw.itemId}:${raw.warehouseId}`,
    productId: raw.itemId,
    locationId: raw.warehouseId,
    quantityOnHand: raw.quantityOnHand ?? 0,
    quantityAvailable: raw.quantityAvailable,
    quantityCommitted: raw.quantityAllocated,
    quantityIncoming: raw.quantityOnOrder,
    reorderPoint: raw.reorderPoint,
    reorderQuantity: raw.reorderQuantity,
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'da-vinci-unified',
    metadata: strMap({}),
    raw,
  }
}
