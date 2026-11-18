/**
 * Vendure StockLevel -> canonical InventoryLevel.
 *
 * Vendure tracks stock per variant per location via `stockLevels` on
 * `ProductVariant`. Each entry has `{ stockLocationId, stockOnHand, stockAllocated }`.
 * The composite id is `${variantId}:${stockLocationId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawVendureStockLevel {
  stockLocationId?: string
  stockLocation?: { id: string; name?: string } | null
  stockOnHand: number
  stockAllocated?: number
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawVendureStockLevel,
  variantId: string,
): InventoryLevel {
  const locationId = raw.stockLocationId ?? raw.stockLocation?.id ?? ''
  const allocated = raw.stockAllocated ?? 0
  const available = raw.stockOnHand - allocated

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed: allocated,
    onHand: raw.stockOnHand,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
