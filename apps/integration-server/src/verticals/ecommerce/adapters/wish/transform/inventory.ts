/**
 * Wish Variant → canonical InventoryLevel.
 *
 * Wish does not have a dedicated inventory or location API resource. Instead,
 * inventory is stored at the variant level: each variant object returned by
 * `GET /api/v2/variant` and `GET /api/v2/variant/multi-get` carries an
 * `inventory` integer field representing available stock.
 *
 * To update inventory, merchants POST to `variant/update-inventory` with
 * `sku` and `inventory` (absolute quantity, not a delta).
 *
 * Because Wish has no location concept in its merchant API, we use the
 * sentinel locationId `'wish'` for every InventoryLevel. The synthesised id
 * is `${variantId}:wish` per the canonical schema convention.
 *
 * Docs:
 *   https://merchant.wish.com/documentation/api/v2/explorer/variant
 *   https://merchant.wish.com/documentation/api/v2/explorer/variant/update-inventory
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawWishV3Variation } from './product'

/** Sentinel location id used when Wish has no location concept. */
export const WISH_LOCATION_ID = 'wish'

/**
 * Raw Wish variant fields relevant to inventory.
 * The full variant shape is in `RawWishVariant` (product.ts); this interface
 * covers only the fields consumed by the inventory transform.
 */
export interface RawWishInventoryVariant {
  id?: string
  sku?: string
  /** Available inventory count (integer units). */
  inventory?: number
  /** Unix epoch integer or ISO-8601 datetime string. */
  last_updated?: string | number
  [key: string]: unknown
}

/**
 * Transform a Wish variant's inventory fields into a canonical InventoryLevel.
 *
 * @param raw - Variant data from `GET /api/v2/variant` or `variant/multi-get`.
 */
export function transformInventoryLevel(raw: RawWishInventoryVariant): InventoryLevel {
  const variantId = raw.id ? String(raw.id) : (raw.sku ?? '')
  const locationId = WISH_LOCATION_ID
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.inventory ?? 0,
    updatedAt: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── API v3 (reads) ───────────────────────────────────────────────────────────

/**
 * v3 inventory levels of one variation: one per entry of its `inventories`,
 * "The inventory of the variation in each warehouse." Each `WarehouseInventory`
 * is required ["warehouse_id", "inventory"]: "The inventory of a variation in
 * the warehouse." and "The ID of the warehouse." The warehouse is the
 * location, so the id is `${variationId}:${warehouseId}`.
 *
 * A v3 variation carries no timestamp, so `updatedAt` stays absent.
 */
export function transformV3InventoryLevels(variation: RawWishV3Variation): InventoryLevel[] {
  if (!variation.id) throw new Error('Wish variation has no id')
  const variantId = variation.id
  return (variation.inventories ?? []).map((inv) => ({
    id: `${variantId}:${inv.warehouse_id}`,
    variantId,
    locationId: inv.warehouse_id,
    available: inv.inventory,
    metadata: { ...inv },
  }))
}
