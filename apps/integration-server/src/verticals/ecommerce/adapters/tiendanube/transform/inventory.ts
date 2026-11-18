/**
 * Tiendanube / Nuvemshop Inventory Level → canonical InventoryLevel.
 *
 * Tiendanube exposes inventory via:
 *   GET /locations/{location_id}/inventory-levels
 *
 * The response is an array of inventory level objects keyed by variant id
 * and location id. There is no stable top-level id, so we synthesise one as
 * `${variant_id}:${location_id}`.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/location
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeInventoryLevel {
  variant_id: number | string
  location_id?: number | string
  stock?: number | null
  /** Some API versions expose `available` as a field name. */
  available?: number | null
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawTiendanubeInventoryLevel,
  locationId?: string,
): InventoryLevel {
  const variantId = String(raw.variant_id)
  const locId = locationId ?? (raw.location_id != null ? String(raw.location_id) : 'unknown')
  const available = raw.available ?? raw.stock ?? 0

  return {
    id: `${variantId}:${locId}`,
    variantId,
    locationId: locId,
    available: typeof available === 'number' ? available : parseInt(String(available), 10) || 0,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
