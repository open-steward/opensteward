/**
 * Bagisto Inventory → canonical InventoryLevel.
 *
 * Bagisto supports multi-source inventory. Each inventory record links a
 * product to an `inventory_source` (warehouse/location) with a `qty` value.
 *
 * The canonical InventoryLevel id is `${variantId}:${locationId}`, mirroring
 * the Shopify/WooCommerce convention. When a product has no variants, the
 * variantId is `${productId}:default`.
 *
 * Bagisto inventory endpoint: `GET /api/v1/inventories`
 * Each record shape:
 * ```json
 * {
 *   "id": 1,
 *   "qty": 100,
 *   "product_id": 5,
 *   "inventory_source_id": 1,
 *   "inventory_source": { "id": 1, "name": "Default" }
 * }
 * ```
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Bagisto shapes ────────────────────────────────────────────────────────

export interface BagistoInventorySource {
  id?: number | string
  name?: string | null
  [key: string]: unknown
}

export interface BagistoInventory {
  id: number | string
  qty?: number | null
  product_id?: number | string | null
  inventory_source_id?: number | string | null
  inventory_source?: BagistoInventorySource | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: BagistoInventory): InventoryLevel {
  const productId = raw.product_id != null ? String(raw.product_id) : 'unknown'
  const variantId = `${productId}:default`
  const locationId =
    raw.inventory_source_id != null
      ? String(raw.inventory_source_id)
      : raw.inventory_source?.id != null
        ? String(raw.inventory_source.id)
        : 'default'

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.qty ?? 0,
    metadata: raw as Record<string, unknown>,
  }
}
