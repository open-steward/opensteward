/**
 * BigCommerce Inventory → canonical InventoryLevel.
 *
 * BigCommerce tracks inventory at the variant level via `inventory_level`
 * on the variant object. For multi-location stores, the Inventory API
 * (`/v3/inventory/items`) provides per-location data.
 *
 * We synthesise a composite id as `${variantId}:${locationId}` matching
 * the same pattern as Shopify.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawBigCommerceInventoryItem {
  variant_id?: number | string
  product_id?: number | string
  location_id?: number | string
  available_stock?: number
  total_stock?: number
  settings?: {
    safety_stock?: number
    warning_level?: number
  }
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawBigCommerceInventoryItem): InventoryLevel {
  const variantId = String(raw.variant_id ?? raw.product_id ?? '')
  const locationId = String(raw.location_id ?? 'default')
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.available_stock ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a simple variant-level inventory record (from the product
 * variant's `inventory_level` field) into a canonical InventoryLevel.
 */
export function transformVariantInventory(
  variantId: string | number,
  available: number,
  locationId: string = 'default',
): InventoryLevel {
  const vid = String(variantId)
  const lid = String(locationId)
  return {
    id: `${vid}:${lid}`,
    variantId: vid,
    locationId: lid,
    available,
    metadata: { variant_id: variantId, location_id: locationId, available_stock: available },
  }
}
