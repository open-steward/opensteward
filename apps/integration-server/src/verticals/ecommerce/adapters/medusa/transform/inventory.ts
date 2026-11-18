/**
 * Medusa v2 Inventory Item + Location Level → canonical InventoryLevel.
 *
 * Medusa v2 has a proper inventory module:
 *  - Inventory items are linked to variants
 *  - Location levels track stock per (inventory_item, stock_location)
 *
 * The canonical id is synthesized as `${variantId}:${locationId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawMedusaLocationLevel {
  id?: string
  inventory_item_id?: string
  location_id?: string
  stocked_quantity?: number
  reserved_quantity?: number
  incoming_quantity?: number
  available_quantity?: number
  [key: string]: unknown
}

export interface RawMedusaInventoryItem {
  id: string
  sku?: string | null
  title?: string | null
  requires_shipping?: boolean
  location_levels?: RawMedusaLocationLevel[]
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  item: RawMedusaInventoryItem,
  locationLevel: RawMedusaLocationLevel,
  variantId: string,
): InventoryLevel {
  const locationId = locationLevel.location_id ?? ''
  const available = locationLevel.available_quantity ?? locationLevel.stocked_quantity ?? 0
  const reserved = locationLevel.reserved_quantity ?? 0
  const incoming = locationLevel.incoming_quantity ?? 0
  const onHand = (locationLevel.stocked_quantity ?? available) + reserved

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed: reserved > 0 ? reserved : undefined,
    incoming: incoming > 0 ? incoming : undefined,
    onHand,
    updatedAt: item.updated_at,
    metadata: { item, locationLevel } as unknown as Record<string, unknown>,
  }
}
