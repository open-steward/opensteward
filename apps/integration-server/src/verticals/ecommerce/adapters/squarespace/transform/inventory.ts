/**
 * Squarespace Inventory → canonical InventoryLevel.
 *
 * Squarespace exposes inventory through the product variants endpoint. Each
 * variant has a `stock` object with `quantity` and `unlimited` fields. The
 * inventory endpoint is `GET /1.0/commerce/inventory`.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/retrieve-stock-for-all-items
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawSquarespaceInventoryItem {
  variantId: string
  sku?: string | null
  isUnlimited?: boolean
  quantity?: number | null
  [key: string]: unknown
}

/**
 * Transform a Squarespace inventory item into the canonical InventoryLevel.
 *
 * Squarespace doesn't have multi-location inventory — everything is
 * single-location. We use a synthetic location id of `default`.
 */
export function transformInventoryLevel(raw: RawSquarespaceInventoryItem): InventoryLevel {
  return {
    id: `${raw.variantId}:default`,
    variantId: raw.variantId,
    locationId: 'default',
    available: raw.isUnlimited ? 999999 : (raw.quantity ?? 0),
    updatedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
