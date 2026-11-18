/**
 * Shoplazza InventoryLevel → canonical InventoryLevel.
 *
 * Shoplazza v2025-06 has dedicated inventory_levels endpoints (introduced in
 * the 2025-06 inventory overhaul):
 *   GET /openapi/2025-06/inventory_levels
 *
 * Records are keyed by `(inventory_item_id, location_id)`. No stable primary
 * key exists, so we synthesise one as `${inventory_item_id}:${location_id}`.
 *
 * The canonical schema uses `variantId` on this resource. Shoplazza inventory
 * levels are tied to inventory items; the closest analogue is the variant's
 * own `id` (via `inventory_quantity`) — we carry `inventory_item_id` here when
 * present, otherwise fall back to variant_id.
 *
 * Docs: https://www.shoplazza.dev/api/changelog (v202506 inventory overhaul)
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawShoplazzaInventoryLevel {
  inventory_item_id?: number | string | null
  variant_id?: number | string | null
  location_id: number | string
  available?: number | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawShoplazzaInventoryLevel): InventoryLevel {
  const itemId = raw.inventory_item_id != null
    ? String(raw.inventory_item_id)
    : raw.variant_id != null
      ? String(raw.variant_id)
      : 'unknown'
  const locationId = String(raw.location_id)
  return {
    id: `${itemId}:${locationId}`,
    variantId: itemId,
    locationId,
    available: raw.available ?? 0,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
