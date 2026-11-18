/**
 * Transform a Blue Yonder WMS InventoryPosition to the canonical StockLevel.
 *
 * Source: GET /wms/v1/inventory  — InventoryPosition schema
 *   positionId, itemId, locationId, quantityOnHand, quantityAvailable,
 *   quantityReserved, unitOfMeasure, lotNumber, serialNumber,
 *   expirationDate, status, lastUpdated
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawBlueYonderInventoryPosition {
  positionId?: string
  itemId: string
  itemDescription?: string
  locationId?: string
  locationName?: string
  zone?: string
  quantityOnHand?: number
  quantityAvailable?: number
  quantityReserved?: number
  unitOfMeasure?: string
  lotNumber?: string
  serialNumber?: string
  expirationDate?: string
  status?: string
  lastUpdated?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawBlueYonderInventoryPosition): StockLevel {
  const locationId = pickStr(raw.locationId) ?? ''
  const id = pickStr(raw.positionId) ?? `${raw.itemId}:${locationId}`
  return {
    id,
    productId: raw.itemId,
    locationId,
    quantityOnHand: pickNum(raw.quantityOnHand) ?? 0,
    quantityAvailable: pickNum(raw.quantityAvailable),
    quantityCommitted: pickNum(raw.quantityReserved),
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.lastUpdated),
    platform: 'blue-yonder',
    metadata: strMap({
      zone: raw.zone,
      locationName: raw.locationName,
      unitOfMeasure: raw.unitOfMeasure,
      lotNumber: raw.lotNumber,
      serialNumber: raw.serialNumber,
      expirationDate: raw.expirationDate,
      status: raw.status,
    }),
    raw,
  }
}
