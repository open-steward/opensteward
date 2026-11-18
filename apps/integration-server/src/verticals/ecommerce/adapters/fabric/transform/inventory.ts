/**
 * fabric Inventory → canonical InventoryLevel.
 *
 * fabric inventory endpoint: `GET /v3/inventory`.
 * Each inventory record ties a variant (by SKU or variant ID) to a location
 * with `available`, `committed`, `incoming`, and `on_hand` quantities.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawFabricInventory {
  id: string
  variant_id?: string
  sku?: string
  location_id?: string
  available?: number
  committed?: number
  incoming?: number
  on_hand?: number
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawFabricInventory): InventoryLevel {
  const variantId = raw.variant_id ?? raw.sku ?? raw.id
  const locationId = raw.location_id ?? 'default'
  return {
    id: raw.id,
    variantId,
    locationId,
    available: raw.available ?? 0,
    committed: raw.committed,
    incoming: raw.incoming,
    onHand: raw.on_hand ?? (raw.available ?? 0) + (raw.committed ?? 0),
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInventoryLevel(
  data: { variantId: string; locationId: string; available: number },
): Record<string, unknown> {
  return {
    variant_id: data.variantId,
    location_id: data.locationId,
    available: data.available,
  }
}
