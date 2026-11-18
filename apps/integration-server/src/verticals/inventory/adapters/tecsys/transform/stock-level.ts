/**
 * Transform a raw Tecsys OrderDynamics physical-inventory response into the
 * canonical StockLevel schema.
 *
 * OrderDynamics endpoints:
 *   GET /v1/inventory/onhand?locationInternalNames={loc}&skus={sku}
 *   GET /v1/inventory/available?locationInternalNames={loc}&skus={sku}
 *   GET /v1/inventory/BulkOnhand  (POST body with arrays)
 *
 * Each record covers a single SKU × location combination.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawTecsysStockLevel {
  /** Item SKU — maps to productId. */
  Sku: string
  /** Internal name of the inventory location. */
  LocationInternalName?: string
  /** On-hand quantity (all units at this location). */
  OnHandQuantity?: number
  /** Available quantity (on-hand minus committed/allocated). */
  AvailableQuantity?: number
  /** Committed / allocated quantity. */
  CommittedQuantity?: number
  /** Incoming (on-order / in-transit) quantity. */
  IncomingQuantity?: number
  /** Reorder point threshold. */
  ReorderPoint?: number
  /** Suggested reorder quantity. */
  ReorderQuantity?: number
  /** ISO 8601 date/time of the last physical count at this location. */
  LastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawTecsysStockLevel): StockLevel {
  const locationId = raw.LocationInternalName ?? ''
  return {
    id: `${raw.Sku}:${locationId}`,
    productId: raw.Sku,
    locationId,
    quantityOnHand: raw.OnHandQuantity ?? 0,
    quantityAvailable: raw.AvailableQuantity,
    quantityCommitted: raw.CommittedQuantity,
    quantityIncoming: raw.IncomingQuantity,
    reorderPoint: raw.ReorderPoint,
    reorderQuantity: raw.ReorderQuantity,
    lastCountedAt: toIso(raw.LastCountDate),
    platform: 'tecsys',
    metadata: strMap({}),
    raw,
  }
}
