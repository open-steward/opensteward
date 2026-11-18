/**
 * WooCommerce variation stock → canonical InventoryLevel.
 *
 * WooCommerce has no dedicated inventory ledger endpoint — stock is a
 * field on each product/variation (`stock_quantity`). This transform is
 * only used by `adjustInventoryLevel` / `setInventoryLevel` to build the
 * returned canonical shape after a PUT on the variation. The synthetic
 * `default` location id mirrors `syntheticDefaultLocation()`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawWooCommerceVariationStock {
  id: number | string
  stock_quantity?: number | null
  manage_stock?: boolean
  stock_status?: string
  date_modified_gmt?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  variation: RawWooCommerceVariationStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${variation.id}`
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: variation.stock_quantity ?? 0,
    updatedAt: variation.date_modified_gmt,
    metadata: variation as Record<string, unknown>,
  }
}
