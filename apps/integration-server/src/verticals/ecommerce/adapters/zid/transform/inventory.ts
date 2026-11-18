/**
 * Zid InventoryLevel → canonical InventoryLevel.
 *
 * Zid's product endpoint returns per-location stock in
 * `product.stocks: [{ location: string, available_quantity: number }]`.
 *
 * The inventory level id is synthesised as `{productId}:{locationSlug}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawZidStock {
  location?: string | null
  available_quantity?: number | null
}

export interface RawZidInventoryInput {
  productId: string
  stock: RawZidStock
}

export function transformInventoryLevel(input: RawZidInventoryInput): InventoryLevel {
  const locationSlug = input.stock.location ?? 'default'
  return {
    id: `${input.productId}:${locationSlug}`,
    variantId: input.productId,
    locationId: locationSlug,
    available: input.stock.available_quantity ?? 0,
    metadata: input as unknown as Record<string, unknown>,
  }
}
