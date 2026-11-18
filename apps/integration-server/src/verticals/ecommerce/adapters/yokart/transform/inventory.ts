/**
 * Yo!Kart inventory → canonical InventoryLevel.
 *
 * Yo!Kart tracks stock as a `selprod_stock` field on each seller-product
 * (variant) object — there is no dedicated inventory ledger endpoint or
 * multi-location concept. Stock updates are performed by editing the
 * seller-product.
 *
 * We expose a single synthetic "default" location (the store itself) so the
 * canonical surface stays consistent with multi-location platforms.
 *
 * The `variantId` is the Yo!Kart `selprod_id`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartSellerProductStock {
  selprod_id: number | string
  selprod_stock?: number | string | null
  selprod_min_order_qty?: number | string
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawYokartSellerProductStock,
): InventoryLevel {
  const variantId = String(raw.selprod_id)
  const available =
    raw.selprod_stock != null
      ? parseInt(String(raw.selprod_stock), 10)
      : 0
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: Number.isNaN(available) ? 0 : available,
    metadata: raw as Record<string, unknown>,
  }
}
