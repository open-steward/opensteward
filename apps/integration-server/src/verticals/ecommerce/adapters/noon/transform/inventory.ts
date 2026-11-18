/**
 * Noon SKU stock -> canonical InventoryLevel.
 *
 * Noon inventory is managed at the SKU level per warehouse. The Seller API
 * exposes stock per SKU with optional warehouse/location breakdown.
 *
 * When the platform does not expose a warehouse ID, we use a synthetic
 * `noon-default` location.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawNoonStockItem {
  sku?: string
  seller_sku?: string
  warehouse_id?: string | number
  available_quantity?: number
  reserved_quantity?: number
  total_quantity?: number
  updated_at?: string
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'noon-default'

/**
 * Noon stock item -> canonical InventoryLevel.
 *
 * The `variantId` is the `sku` or `seller_sku`. `available` is the
 * available quantity. `committed` maps to reserved quantity.
 */
export function transformInventoryLevel(raw: RawNoonStockItem): InventoryLevel {
  const variantId = raw.sku ?? raw.seller_sku ?? ''
  const locationId = raw.warehouse_id ? String(raw.warehouse_id) : DEFAULT_LOCATION_ID
  const available = raw.available_quantity ?? 0
  const committed = raw.reserved_quantity
  const onHand = raw.total_quantity ?? (committed != null ? available + committed : undefined)

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed,
    onHand,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
