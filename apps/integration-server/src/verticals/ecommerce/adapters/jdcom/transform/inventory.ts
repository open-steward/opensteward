/**
 * JD.com stock info → canonical InventoryLevel.
 *
 * JD stock is managed at the SKU level via `jingdong.stock.read`. Each
 * SKU has a stock count per warehouse. There is no separate location
 * concept exposed — JD manages fulfillment centers internally.
 *
 * We use `jd-default` as a synthetic location id.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdStockInfo {
  sku_id: number
  ware_id?: number
  stock_num?: number
  locked_num?: number
  outer_id?: string
  modified?: string
  [key: string]: unknown
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'jd-default'

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawJdStockInfo): InventoryLevel {
  const available = raw.stock_num ?? 0
  const committed = raw.locked_num

  return {
    id: `${raw.sku_id}:${DEFAULT_LOCATION_ID}`,
    variantId: String(raw.sku_id),
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed,
    onHand: committed != null ? available + committed : undefined,
    updatedAt: raw.modified
      ? new Date(raw.modified).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
