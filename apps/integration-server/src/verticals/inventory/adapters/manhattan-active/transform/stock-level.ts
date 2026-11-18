/**
 * Manhattan Active WM — inventory (stock level) transform.
 *
 * WM REST endpoint: GET /wm/v1/items/{itemId}/inventory
 *
 * Returns per-location on-hand quantities for a given item.  The composite
 * natural key is itemId + locationId.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawManhattanActiveInventory {
  /** System item identifier. */
  itemId: string
  /** Location (bin/zone/warehouse) identifier. */
  locationId: string
  locationName?: string
  /** Quantity physically present. */
  quantityOnHand?: number
  /** Quantity available for allocation (onHand − committed). */
  quantityAvailable?: number
  /** Quantity reserved/allocated to outbound orders. */
  quantityCommitted?: number
  /** Quantity expected from open purchase orders / inbound shipments. */
  quantityIncoming?: number
  /** Reorder point trigger level. */
  reorderPoint?: number
  /** Suggested replenishment quantity. */
  reorderQuantity?: number
  lastCountDateTime?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawManhattanActiveInventory): StockLevel {
  return {
    id: `${raw.itemId}:${raw.locationId}`,
    productId: raw.itemId,
    locationId: raw.locationId,
    quantityOnHand: pickNum(raw.quantityOnHand) ?? 0,
    quantityAvailable: pickNum(raw.quantityAvailable),
    quantityCommitted: pickNum(raw.quantityCommitted),
    quantityIncoming: pickNum(raw.quantityIncoming),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQuantity),
    lastCountedAt: toIso(raw.lastCountDateTime),
    platform: 'manhattan-active',
    metadata: strMap({ locationName: raw.locationName }),
    raw,
  }
}
