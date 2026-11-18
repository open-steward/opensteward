/**
 * MyCashflow Stock → canonical InventoryLevel.
 *
 * MyCashflow exposes inventory via the `/v1/stock` endpoint. Each stock item
 * represents a product/variation's inventory at a particular stock location.
 *
 * Key fields:
 *  - `id`           — stock item identifier
 *  - `product_id`   — product identifier
 *  - `variation_id` — variation identifier (if applicable)
 *  - `quantity`     — current stock quantity (available)
 *  - `location_id`  — stock location identifier (null = default location)
 *
 * The synthetic id follows the pattern `${variantId}:${locationId}` to stay
 * consistent with other adapters.
 *
 * Docs: https://support.mycashflow.com/api/14-stock/
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawMyCashflowStockItem {
  id: number | string
  product_id?: number | string | null
  variation_id?: number | string | null
  quantity?: number | null
  reserved?: number | null
  incoming?: number | null
  location_id?: number | string | null
  updated_at?: string
  [key: string]: unknown
}

/**
 * The variantId used on InventoryLevel follows the composite
 * `productId:variationId` pattern from the product adapter. When there is no
 * variation, we fall back to just the productId.
 */
export function transformInventoryLevel(raw: RawMyCashflowStockItem): InventoryLevel {
  const productId = raw.product_id != null ? String(raw.product_id) : 'unknown'
  const variantId =
    raw.variation_id != null
      ? `${productId}:${raw.variation_id}`
      : productId
  const locationId = raw.location_id != null ? String(raw.location_id) : 'default'
  const available = raw.quantity ?? 0
  const committed = raw.reserved ?? undefined
  const incoming = raw.incoming ?? undefined
  const onHand =
    committed != null ? available + committed : undefined

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed,
    incoming,
    onHand,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
