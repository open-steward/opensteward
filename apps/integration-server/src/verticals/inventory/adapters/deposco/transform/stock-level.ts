/**
 * Transform a Deposco WMS inventory record into the canonical StockLevel shape.
 *
 * Endpoint: GET /inventory/{businessUnit}/facility/{facilityNumber}/location/{locationNumber}
 * or:       GET /inventory/{businessUnit}  (all facilities)
 *
 * Field notes:
 *   itemNumber        — product SKU/ID
 *   facilityNumber    — warehouse / facility identifier
 *   locationNumber    — bin / location within facility
 *   quantityOnHand    — total physical qty on hand
 *   quantityAvailable — available qty (on-hand minus committed)
 *   quantityCommitted — committed to orders
 *   quantityIncoming  — qty on inbound orders
 *   reorderPoint      — qty level that triggers reorder
 *   reorderQuantity   — qty to order on reorder
 *   lastCycleCountDate — ISO date of last physical count
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawDeposcoInventory {
  itemNumber: string
  facilityNumber?: string
  locationNumber?: string
  quantityOnHand?: number | string
  quantityAvailable?: number | string
  quantityCommitted?: number | string
  quantityIncoming?: number | string
  reorderPoint?: number | string
  reorderQuantity?: number | string
  lastCycleCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawDeposcoInventory): StockLevel {
  const facilityId = raw.facilityNumber ?? ''
  const locationId = raw.locationNumber
    ? `${facilityId}:${raw.locationNumber}`
    : facilityId

  return {
    id: `${raw.itemNumber}:${locationId}`,
    productId: raw.itemNumber,
    locationId,
    quantityOnHand: pickNum(raw.quantityOnHand) ?? 0,
    quantityAvailable: pickNum(raw.quantityAvailable),
    quantityCommitted: pickNum(raw.quantityCommitted),
    quantityIncoming: pickNum(raw.quantityIncoming),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQuantity),
    lastCountedAt: toIso(raw.lastCycleCountDate),
    platform: 'deposco',
    metadata: strMap({ facilityNumber: raw.facilityNumber, locationNumber: raw.locationNumber }),
    raw,
  }
}
