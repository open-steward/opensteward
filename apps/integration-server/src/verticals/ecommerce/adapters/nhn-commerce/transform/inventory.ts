/**
 * NHN Commerce (Shopby) Stock → canonical InventoryLevel.
 *
 * Shopby returns stock count inside product option objects. There is no
 * dedicated inventory-level endpoint in the shop API. We derive inventory
 * levels from product option `stockCnt` fields, using the productNo as a
 * proxy location id (Shopby is single-location by default).
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnStockInfo {
  optionNo?: number | string
  mallOptionNo?: number | string
  productNo?: number | string
  stockCnt?: number
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Synthesize an InventoryLevel from a product option's stock count.
 *
 * @param raw      The option/stock object
 * @param locationId  A virtual location id — defaults to the productNo or 'default'
 */
export function transformInventoryLevel(
  raw: RawNhnStockInfo,
  locationId?: string,
): InventoryLevel {
  const optionId = raw.optionNo ?? raw.mallOptionNo
  const variantId = optionId != null ? String(optionId) : String(raw.productNo ?? '')
  const locId = locationId ?? String(raw.productNo ?? 'default')

  return {
    id: `${variantId}:${locId}`,
    variantId,
    locationId: locId,
    available: raw.stockCnt ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
