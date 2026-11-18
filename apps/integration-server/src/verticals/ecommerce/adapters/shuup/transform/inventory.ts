/**
 * Shuup StockCount → canonical InventoryLevel.
 *
 * Shuup exposes stock counts at `/api/v1/shuup/stock_count/`. Each record
 * links a product to a supplier (which acts as the "location") and carries
 * `logical_count` (available) and `physical_count` (on-hand) quantities.
 *
 * The canonical InventoryLevel id is `${productId}:${supplierId}` so both
 * can be reconstructed by splitting on `:`.
 *
 * When stock count data is unavailable, a synthetic zero-quantity inventory
 * level can be derived from a product record using `transformInventoryLevelFromProduct`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Shuup shapes ─────────────────────────────────────────────────────────

export interface ShuupStockCount {
  id?: number | string
  product?: number | string | null
  /** Supplier id acts as the location. */
  supplier?: number | string | null
  logical_count?: number | string | null
  physical_count?: number | string | null
  stock_managed?: boolean | null
  created_on?: string | null
  modified_on?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCount(value: number | string | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  return parseFloat(value) || 0
}

export function transformInventoryLevel(raw: ShuupStockCount): InventoryLevel {
  const productId = raw.product != null ? String(raw.product) : 'unknown'
  const supplierId = raw.supplier != null ? String(raw.supplier) : 'default'
  const variantId = `${productId}:default`
  const locationId = supplierId
  const available = parseCount(raw.logical_count)
  const onHand = parseCount(raw.physical_count)

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    onHand: onHand > 0 ? onHand : undefined,
    updatedAt: raw.modified_on ?? raw.created_on ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
