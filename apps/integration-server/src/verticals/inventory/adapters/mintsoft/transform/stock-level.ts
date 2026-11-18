import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * Mintsoft stock-level record.  Two endpoint schemas are handled here:
 *
 * StockLevel (GET /api/Product/StockLevels, GET /api/Product/{id}/Inventory):
 *   Level, LowStockLevel, PreOrderable, Bundle, LastUpdated
 *
 * BulkInventoryItem (GET /api/Product/Inventory/Bulk):
 *   StockLevel, OnHand, Allocated, OffHand, AwaitingReplen, OnOrder,
 *   InTransit, InQuarantine, LocationId, LastUpdated
 *
 * Both share ProductId, WarehouseId, ClientId, SKU, LastUpdated.
 * Field names sourced from the Mintsoft Swagger spec.
 */
export interface RawMintsoftStockLevel {
  ProductId: number
  WarehouseId: number
  ClientId?: number
  SKU?: string
  // StockLevel endpoint fields
  Level?: number
  LowStockLevel?: number
  PreOrderable?: boolean
  Bundle?: boolean
  // BulkInventoryItem endpoint fields
  StockLevel?: number
  OnHand?: number
  Allocated?: number
  OffHand?: number
  AwaitingReplen?: number
  OnOrder?: number
  InTransit?: number
  InQuarantine?: number
  LocationId?: number
  LastUpdated?: string
  Breakdown?: unknown[]
  [key: string]: unknown
}

export function transformStockLevel(raw: RawMintsoftStockLevel): StockLevel {
  const productId = String(raw.ProductId)
  const locationId = String(raw.WarehouseId)

  // Level comes from /api/Product/StockLevels; StockLevel from /api/Product/Inventory/Bulk
  const quantityOnHand = pickNum(raw.Level) ?? pickNum(raw.StockLevel) ?? 0

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand,
    quantityAvailable: pickNum(raw.OnHand),
    quantityCommitted: pickNum(raw.Allocated),
    quantityIncoming: pickNum(raw.InTransit),
    reorderPoint: pickNum(raw.LowStockLevel),
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.LastUpdated),
    platform: 'mintsoft',
    metadata: strMap({
      sku: raw.SKU,
      clientId: raw.ClientId,
      preOrderable: raw.PreOrderable,
      bundle: raw.Bundle,
      offHand: raw.OffHand,
      onOrder: raw.OnOrder,
      inQuarantine: raw.InQuarantine,
    }),
    raw,
  }
}
