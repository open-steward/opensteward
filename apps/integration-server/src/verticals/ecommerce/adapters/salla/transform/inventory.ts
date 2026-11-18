/**
 * Salla Inventory → canonical InventoryLevel.
 *
 * Salla exposes product stock via the product object (`quantity` field) and
 * the List Products Quantities endpoint (/admin/v2/products/quantities).
 * A stable InventoryLevel id is synthesised as `${productId}:default` since
 * Salla does not expose a separate inventory-item concept in the same way
 * as Shopify.
 *
 * Docs: https://docs.salla.dev/9612796e0
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

/**
 * Minimal shape for a Salla product quantity item (from list quantities
 * endpoint or embedded in product).
 */
export interface RawSallaProductQuantity {
  /** Product or SKU id. */
  id: number | string
  product_id?: number | string
  quantity?: number | null
  unlimited?: boolean
  updated_at?: string | null
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'default'

export function transformInventoryLevel(raw: RawSallaProductQuantity): InventoryLevel {
  const variantId = raw.product_id != null ? String(raw.product_id) : String(raw.id)
  const locationId = DEFAULT_LOCATION_ID
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.quantity ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a synthetic InventoryLevel from a product's top-level quantity field.
 * Used when fetching a product rather than the dedicated quantities endpoint.
 */
export function syntheticInventoryLevel(
  productId: string | number,
  quantity: number,
): InventoryLevel {
  const variantId = String(productId)
  const locationId = DEFAULT_LOCATION_ID
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: quantity,
    metadata: {},
  }
}
