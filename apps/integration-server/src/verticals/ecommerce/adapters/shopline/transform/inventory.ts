/**
 * SHOPLINE InventoryLevel → canonical InventoryLevel.
 *
 * SHOPLINE's inventory level set endpoint returns an `inventory_level` object
 * keyed by `(inventory_item_id, location_id)`. There is no stable primary key,
 * so we synthesise one as `${inventory_item_id}:${location_id}`.
 *
 * The canonical schema uses `variantId`; SHOPLINE also surfaces a `variant_id`
 * directly on the inventory level response, so we prefer it over item id.
 *
 * Docs:
 *   https://developer.shopline.com/docs/admin-rest-api/product/inventory/set-item-inventory/
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawShoplineInventoryLevel {
  inventory_item_id: number | string
  location_id: number | string
  available: number | null
  /** Returned by the set endpoint — the variant this item belongs to. */
  variant_id?: number | string | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawShoplineInventoryLevel): InventoryLevel {
  const itemId = String(raw.inventory_item_id)
  const locationId = String(raw.location_id)
  // Use variant_id when available; fall back to inventory_item_id (same
  // pattern used by Shopify adapter for consistency).
  const variantId = raw.variant_id != null ? String(raw.variant_id) : itemId
  return {
    id: `${itemId}:${locationId}`,
    variantId,
    locationId,
    available: raw.available ?? 0,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
