/**
 * OpenCart product stock → canonical InventoryLevel.
 *
 * OpenCart tracks stock as a `quantity` field on each product. There
 * is no dedicated inventory ledger endpoint. This transform builds the
 * canonical shape after a stock update. The synthetic `default` location
 * id mirrors `syntheticDefaultLocation()`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawOpenCartProductStock {
  product_id: number | string
  quantity?: number | string | null
  stock_status_id?: number | string
  date_modified?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  product: RawOpenCartProductStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:default`
  const qty = product.quantity != null ? Number(product.quantity) : 0
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: Number.isNaN(qty) ? 0 : qty,
    updatedAt: product.date_modified,
    metadata: product as Record<string, unknown>,
  }
}
