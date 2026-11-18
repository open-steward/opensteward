/**
 * Cafe24 Product Variant Inventory → canonical InventoryLevel.
 *
 * Cafe24 inventory is accessed per variant:
 *   GET /api/v2/admin/products/{product_no}/variants/{variant_code}/inventories
 *
 * There is no global location-based inventory endpoint analogous to Shopify's
 * `/inventory_levels.json`. Cafe24 inventories are per-variant, and may
 * optionally include warehouse/location breakdown.
 *
 * We synthesise the canonical `id` as `${variant_code}:cafe24` when no
 * location is available, or `${variant_code}:${location_code}` if present.
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#products-variants-inventories
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24Inventory {
  variant_code?: string | null
  product_no?: number | string | null
  quantity?: number | null
  safety_stock_quantity?: number | null
  location?: string | null
  location_code?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawCafe24Inventory,
  variantCode?: string,
): InventoryLevel {
  const vCode = variantCode ?? String(raw.variant_code ?? '')
  const locationCode = raw.location_code ?? raw.location ?? 'cafe24'
  const syntheticId = `${vCode}:${locationCode}`

  return {
    id: syntheticId,
    variantId: vCode,
    locationId: String(locationCode),
    available: typeof raw.quantity === 'number' ? Math.max(0, raw.quantity) : 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
