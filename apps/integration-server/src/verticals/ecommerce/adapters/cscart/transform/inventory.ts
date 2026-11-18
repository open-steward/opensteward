/**
 * CS-Cart Product / Combination → canonical InventoryLevel.
 *
 * CS-Cart stores inventory as the `amount` field on the product or
 * combination (variant). There is no dedicated inventory ledger endpoint and
 * no native multi-location — we synthesize a single `default` location so
 * the canonical REST surface stays consistent across platforms.
 *
 * The canonical InventoryLevel id is synthesised as `${variantId}:default`
 * following the convention used by WooCommerce and other single-location
 * adapters.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw CS-Cart shape ────────────────────────────────────────────────────────

/** Minimal shape: a product or combination object that carries stock info. */
export interface CsCartStockItem {
  /** Product or combination id. */
  product_id?: number | string
  combination_id?: number | string
  amount?: number | string | null
  timestamp?: number | string
  updated_timestamp?: number | string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * Build a canonical InventoryLevel from a CS-Cart product or combination.
 *
 * @param raw       The CS-Cart stock item (product or combination).
 * @param variantId The canonical variant id (`productId` or `productId:combinationId`).
 */
export function transformInventoryLevel(
  raw: CsCartStockItem,
  variantId: string,
): InventoryLevel {
  const available =
    raw.amount != null
      ? typeof raw.amount === 'string'
        ? parseInt(raw.amount, 10)
        : raw.amount
      : 0

  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: Number.isNaN(available) ? 0 : available,
    updatedAt:
      tsToIso(raw.updated_timestamp) ??
      tsToIso(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
