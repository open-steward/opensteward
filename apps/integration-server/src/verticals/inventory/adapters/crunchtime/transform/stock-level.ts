/**
 * Transform Crunchtime Current Inventory → canonical StockLevel.
 *
 * Source: GET /inventory/v1/getCurrentInventoryByPage
 *
 * Key Crunchtime field names:
 *   productNumber, locationCode, currentQuantity, minPar, maxPar,
 *   unitCost, lastCountDate
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap, toIso} from './shared'

export interface RawCrunchtimeCurrentInventory {
  productNumber: string
  locationCode?: string
  currentQuantity?: number
  minPar?: number
  maxPar?: number
  unitCost?: number
  lastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawCrunchtimeCurrentInventory): StockLevel {
  const locationId = pickStr(raw.locationCode) ?? ''
  return {
    id: `${raw.productNumber}:${locationId}`,
    productId: raw.productNumber,
    locationId,
    quantityOnHand: raw.currentQuantity ?? 0,
    reorderPoint: raw.minPar,
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'crunchtime',
    metadata: strMap({
      maxPar: raw.maxPar != null ? String(raw.maxPar) : undefined,
      unitCost: raw.unitCost != null ? String(raw.unitCost) : undefined,
    }),
    raw,
  }
}
