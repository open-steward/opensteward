/**
 * Kaufland Marketplace Unit → canonical InventoryLevel.
 *
 * Kaufland's inventory model uses "units" (product offers) — each unit is a
 * seller's listing for a specific EAN at a specific price and stock quantity.
 * The `amount` field on a unit is the available stock count. There is no
 * location concept for seller-fulfilled inventory; we use the seller's
 * warehouse (id_warehouse) as the location id, falling back to a synthetic
 * "default" value.
 *
 * The canonical `variantId` maps to Kaufland's `id_unit` (the unit id), since
 * that is the primary identifier of the sellable item. The `id_product` is
 * available on the embedded product object.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-inventory
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandUnit {
  /** Kaufland internal unit id. */
  id_unit?: number | string | null
  /** Merchant-assigned offer id. */
  id_offer?: string | null
  /** Product catalog id. */
  id_product?: number | string | null
  /** Warehouse id (used as locationId). */
  id_warehouse?: number | string | null
  /** Available stock quantity. */
  amount?: number | null
  /** Listing price in minor units. */
  price?: number | null
  /** Currency. */
  currency?: string | null
  /** Status. */
  status?: string | null
  date_inserted_iso?: string | null
  date_lastchange_iso?: string | null
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawKauflandUnit): InventoryLevel {
  const unitId = raw.id_unit != null ? String(raw.id_unit) : (raw.id_offer ?? 'unknown')
  const locationId = raw.id_warehouse != null ? String(raw.id_warehouse) : 'default'
  return {
    id: `${unitId}:${locationId}`,
    variantId: unitId,
    locationId,
    available: raw.amount ?? 0,
    updatedAt: raw.date_lastchange_iso ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build the POST /units or PATCH /units/{id} request body from a canonical
 * InventoryLevel. The `storefront` parameter must be set separately.
 */
export function untransformInventoryLevel(
  level: Partial<InventoryLevel> & { storefront?: string },
): Record<string, unknown> {
  return {
    amount: level.available ?? 0,
    ...(level.storefront ? { storefront: level.storefront } : {}),
  }
}
