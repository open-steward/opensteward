/**
 * Bol.com Inventory → canonical InventoryLevel.
 *
 * Bol.com exposes stock info on offers. The inventory endpoint returns
 * a list of offer stock levels. We map each to a canonical InventoryLevel.
 *
 * Since Bol.com does not expose per-location stock, all levels use a
 * synthetic `locationId` of `bol-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export const DEFAULT_LOCATION_ID = 'bol-default'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawBolInventoryOffer {
  ean?: string
  bsku?: string
  nckStock?: number
  stock?: number
  title?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawBolInventoryOffer): InventoryLevel {
  const variantId = raw.ean ?? raw.bsku ?? 'unknown'
  const available = raw.stock ?? raw.nckStock ?? 0

  return {
    id: `${variantId}:${DEFAULT_LOCATION_ID}`,
    variantId,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
