/**
 * Shopware 6 Product stock → canonical InventoryLevel.
 *
 * Shopware 6 tracks stock at the product level (`product.stock`,
 * `product.availableStock`). Multi-warehouse is available via
 * extensions but not in the core API.
 *
 * We synthesize inventory levels from the product entity itself,
 * using `product.id` as both variantId and a default locationId.
 *
 * Canonical id is `${productId}:default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawShopwareProductStock {
  id: string
  productNumber?: string
  stock?: number
  availableStock?: number
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawShopwareProductStock): InventoryLevel {
  return {
    id: `${raw.id}:default`,
    variantId: raw.id,
    locationId: 'default',
    available: raw.availableStock ?? raw.stock ?? 0,
    onHand: raw.stock ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
