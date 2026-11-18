/**
 * Loyverse InventoryLevel → canonical InventoryLevel.
 *
 * The Loyverse `/v1.0/inventory` endpoint returns an `inventory_levels` array.
 * Each entry carries `variant_id`, `store_id`, and `in_stock` (float, not
 * integer). There is no stable composite-key id on the inventory level itself,
 * so we synthesize one as `${variant_id}:${store_id}`.
 *
 * `in_stock` is a count (not minor units) — we round it to the nearest
 * integer as the canonical schema expects an integer.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawLoyverseInventoryLevel {
  variant_id: string
  store_id: string
  /** Current stock quantity (may be a float for weighted items). */
  in_stock?: number | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawLoyverseInventoryLevel): InventoryLevel {
  const inStock = raw.in_stock != null ? Math.round(raw.in_stock) : 0
  return {
    id: `${raw.variant_id}:${raw.store_id}`,
    variantId: raw.variant_id,
    locationId: raw.store_id,
    available: Math.max(0, inStock),
    onHand: Math.max(0, inStock),
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
