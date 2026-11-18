/**
 * Shopify InventoryLevel → canonical InventoryLevel.
 *
 * Shopify's `/inventory_levels.json` endpoint returns records keyed by
 * `(inventory_item_id, location_id)` — there is no stable primary key on an
 * inventory level, so we synthesise one as `${inventory_item_id}:${location_id}`.
 *
 * The canonical schema uses `variantId` on this resource but Shopify's
 * inventory levels are actually tied to *inventory items* (one level removed
 * from variants). Callers who want to resolve items → variants should follow
 * the variant's `inventoryItemId` field.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawShopifyInventoryLevel {
  inventory_item_id: number | string
  location_id: number | string
  available: number | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawShopifyInventoryLevel): InventoryLevel {
  const itemId = String(raw.inventory_item_id)
  const locationId = String(raw.location_id)
  return {
    id: `${itemId}:${locationId}`,
    // Canonical field is `variantId` — we use the Shopify inventory_item_id
    // as the closest analogue. The variant → item link is available on the
    // canonical ProductVariant.inventoryItemId field.
    variantId: itemId,
    locationId,
    available: raw.available ?? 0,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
