import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — inventory-on-hand record.
 *
 * Returned by the /inventoryout (Inventory Out) endpoint, one row per
 * item–warehouse combination.
 */
export interface RawCamelot3plStockLevel {
  itemId: string
  warehouseId?: string
  warehouseCode?: string
  quantityOnHand?: number
  quantityAvailable?: number
  quantityAllocated?: number
  quantityOnOrder?: number
  reorderPoint?: number
  reorderQuantity?: number
  lastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawCamelot3plStockLevel): StockLevel {
  const locationId = String(raw.warehouseId ?? raw.warehouseCode ?? '')
  return {
    id: `${raw.itemId}:${locationId}`,
    productId: String(raw.itemId),
    locationId,
    quantityOnHand: typeof raw.quantityOnHand === 'number' ? raw.quantityOnHand : 0,
    quantityAvailable: typeof raw.quantityAvailable === 'number' ? raw.quantityAvailable : undefined,
    quantityCommitted: typeof raw.quantityAllocated === 'number' ? raw.quantityAllocated : undefined,
    quantityIncoming: typeof raw.quantityOnOrder === 'number' ? raw.quantityOnOrder : undefined,
    reorderPoint: typeof raw.reorderPoint === 'number' ? raw.reorderPoint : undefined,
    reorderQuantity: typeof raw.reorderQuantity === 'number' ? raw.reorderQuantity : undefined,
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'camelot-3pl',
    metadata: strMap({ warehouseCode: raw.warehouseCode }),
    raw,
  }
}
