/**
 * Square InventoryCount → canonical InventoryLevel.
 *
 * Square uses event-sourced inventory. Reads come from
 * `POST /v2/inventory/counts/batch-retrieve`. The canonical id is
 * synthesised as `{catalogObjectId}:{locationId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawSquareInventoryCount {
  catalog_object_id: string
  catalog_object_type?: string
  location_id: string
  quantity?: string // Square returns quantity as a string
  state?: string // IN_STOCK, SOLD, etc.
  calculated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawSquareInventoryCount): InventoryLevel {
  const variantId = raw.catalog_object_id
  const locationId = raw.location_id
  const available = raw.quantity != null ? parseFloat(raw.quantity) : 0

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: Number.isNaN(available) ? 0 : available,
    updatedAt: raw.calculated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
