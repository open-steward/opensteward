/**
 * OroCommerce InventoryLevel → canonical InventoryLevel.
 *
 * OroCommerce inventory levels live at `/api/inventorylevels`, keyed
 * by product + warehouse. The canonical id is synthesized as
 * `${productId}:${warehouseId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawOroInventoryLevel {
  id: string
  quantity?: number
  productUnitCode?: string
  product?: { id: string }
  warehouse?: { id: string }
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawOroInventoryLevel): InventoryLevel {
  const productId = raw.product?.id ?? ''
  const warehouseId = raw.warehouse?.id ?? ''
  return {
    id: raw.id || `${productId}:${warehouseId}`,
    variantId: productId,
    locationId: warehouseId,
    available: raw.quantity ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
