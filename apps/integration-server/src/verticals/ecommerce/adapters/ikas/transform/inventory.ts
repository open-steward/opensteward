/**
 * ikas Variant Stock → canonical InventoryLevel.
 *
 * ikas models inventory as `stocks` nested within each variant:
 *   Variant.stocks[].{ stockCount, stockLocationId }
 *
 * There is no separate inventory API endpoint; stock data is part of the
 * product/variant payload and mutations are performed via `saveProduct`.
 *
 * The canonical `id` is synthesised as `${variantId}:${locationId}` to
 * provide a unique stable key for each (variant, location) pair.
 *
 * Docs: https://ikas.dev/docs/api/admin-api/products
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasVariantStock {
  stockCount?: number | null
  stockLocationId?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawIkasVariantStock,
  variantId: string,
): InventoryLevel {
  const locationId = raw.stockLocationId ?? 'default'
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.stockCount ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
