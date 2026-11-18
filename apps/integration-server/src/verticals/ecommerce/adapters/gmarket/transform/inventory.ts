/**
 * Gmarket Inventory → canonical InventoryLevel.
 *
 * Gmarket exposes stock as a field on product items. The adapter
 * projects this onto canonical InventoryLevel.
 *
 * Since Gmarket does not expose per-location stock, all levels use
 * a synthetic `locationId` of `gmarket-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export const DEFAULT_LOCATION_ID = 'gmarket-default'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGmarketInventoryItem {
  goodsNo: string
  sellerItemCode?: string
  stockQuantity?: number
  reservedQuantity?: number
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Gmarket inventory item → canonical InventoryLevel.
 */
export function transformInventoryLevel(raw: RawGmarketInventoryItem): InventoryLevel {
  const available = raw.stockQuantity ?? 0

  return {
    id: `${raw.goodsNo}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.goodsNo,
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed: raw.reservedQuantity,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
