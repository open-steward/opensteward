/**
 * Saleor Stock → canonical InventoryLevel.
 *
 * Saleor stocks are scoped by (variant, warehouse). There is no stable
 * single-field id, so we synthesize `${variantId}:${warehouseId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawSaleorStock {
  id?: string
  warehouse?: { id: string } | null
  quantity: number
  quantityAllocated?: number
  productVariant?: { id: string } | null
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawSaleorStock,
  variantIdOverride?: string,
): InventoryLevel {
  const variantId = variantIdOverride ?? raw.productVariant?.id ?? ''
  const warehouseId = raw.warehouse?.id ?? ''
  const allocated = raw.quantityAllocated ?? 0
  const available = raw.quantity - allocated

  return {
    id: `${variantId}:${warehouseId}`,
    variantId,
    locationId: warehouseId,
    available,
    committed: allocated,
    onHand: raw.quantity,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
