/**
 * Bumpa Inventory → canonical InventoryLevel.
 *
 * Bumpa exposes stock via GET /v1/inventory and PATCH /v1/inventory/:id.
 * Each record has a product/variant id and a quantity field. Since Bumpa
 * does not expose multi-location inventory levels, we use a synthetic
 * location id of 'default'.
 *
 * The canonical `id` is synthesised as `${variantId}:${locationId}` since
 * Bumpa does not have a standalone inventory level id.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawBumpaInventoryItem {
  id?: number | string
  product_id?: number | string
  variant_id?: number | string
  quantity?: number
  stock?: number
  available?: number
  committed?: number
  incoming?: number
  on_hand?: number
  location_id?: number | string
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawBumpaInventoryItem): InventoryLevel {
  const variantId = String(raw.variant_id ?? raw.product_id ?? raw.id ?? 'unknown')
  const locationId = raw.location_id != null ? String(raw.location_id) : 'default'
  const available = raw.available ?? raw.quantity ?? raw.stock ?? 0

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed: raw.committed,
    incoming: raw.incoming,
    onHand: raw.on_hand,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
