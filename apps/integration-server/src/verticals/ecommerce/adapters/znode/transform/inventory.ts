/**
 * Znode Inventory → canonical InventoryLevel.
 *
 * Znode inventory is tracked per product per warehouse via
 * `/api/inventory`. The canonical id is synthesized as
 * `${productId}:${warehouseId}` when no native id is available.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawZnodeInventory {
  InventoryId?: number
  Quantity?: number
  ReorderLevel?: number
  ProductId?: number
  WarehouseId?: number
  SKU?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawZnodeInventory): InventoryLevel {
  const productId = raw.ProductId != null ? String(raw.ProductId) : ''
  const warehouseId = raw.WarehouseId != null ? String(raw.WarehouseId) : ''
  return {
    id: raw.InventoryId != null ? String(raw.InventoryId) : `${productId}:${warehouseId}`,
    variantId: productId,
    locationId: warehouseId,
    available: raw.Quantity ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
