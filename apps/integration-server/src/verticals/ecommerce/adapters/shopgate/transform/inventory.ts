/**
 * Shopgate Inventory → canonical InventoryLevel.
 *
 * Shopgate models inventory via the Catalog Service's `/inventories` endpoint.
 * Each inventory record links a product/variant (via `productCode` +
 * optionally `variantCode`) to a location (`locationCode`) with an `available`
 * quantity.
 *
 * There is no stable single id — we synthesise one as
 * `{productCode}:{locationCode}` (or `{variantCode}:{locationCode}` when a
 * variant code is present).
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateInventory {
  productCode: string
  variantCode?: string | null
  locationCode: string
  available?: number | null
  onHand?: number | null
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawShopgateInventory): InventoryLevel {
  const variantId = raw.variantCode ?? raw.productCode
  const locationId = raw.locationCode
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.available ?? raw.onHand ?? 0,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
