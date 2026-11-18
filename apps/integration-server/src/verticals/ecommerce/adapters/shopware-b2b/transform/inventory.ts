/**
 * Shopware B2B Suite Product stock → canonical InventoryLevel.
 *
 * Identical to base Shopware 6 — B2B Suite does not modify inventory.
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
