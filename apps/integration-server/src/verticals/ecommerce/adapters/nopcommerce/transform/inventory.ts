/**
 * nopCommerce product stock → canonical InventoryLevel.
 *
 * nopCommerce tracks stock on two levels:
 *  1. Product-level `stock_quantity` (for products without attribute combinations)
 *  2. Attribute-combination-level `stock_quantity` (per combination)
 *
 * This transform handles both shapes. The synthetic `default` location id
 * mirrors `syntheticDefaultLocation()`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawNopProductStock {
  id: number | string
  stock_quantity?: number | null
  manage_inventory_method_id?: number
  updated_on_utc?: string
  [key: string]: unknown
}

export interface RawNopCombinationStock {
  id: number | string
  product_id?: number | string
  stock_quantity?: number | null
  allow_out_of_stock_orders?: boolean
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawNopProductStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${raw.id}`
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: raw.stock_quantity ?? 0,
    updatedAt: raw.updated_on_utc,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCombinationInventoryLevel(
  raw: RawNopCombinationStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${raw.id}`
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: raw.stock_quantity ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
