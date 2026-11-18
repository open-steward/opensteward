/**
 * Quickbutik Variant → canonical InventoryLevel.
 *
 * Quickbutik tracks stock quantity as `qty` directly on each product /
 * variant. There is no separate inventory ledger endpoint. We synthesise an
 * InventoryLevel from the variant's `qty` field, pinning `locationId` to the
 * synthetic default location `"default"`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Quickbutik shape (minimal, shared with product transform) ──────────────

export interface RawQuickbutikVariantStock {
  id: number | string
  qty?: string | number | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export const DEFAULT_LOCATION_ID = 'default'

export function transformInventoryLevel(
  raw: RawQuickbutikVariantStock,
  productId: string,
): InventoryLevel {
  const variantId = `${productId}:${raw.id}`
  const available = raw.qty != null ? Math.max(0, parseInt(String(raw.qty), 10) || 0) : 0

  return {
    id: `${variantId}:${DEFAULT_LOCATION_ID}`,
    variantId,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as Record<string, unknown>,
  }
}
