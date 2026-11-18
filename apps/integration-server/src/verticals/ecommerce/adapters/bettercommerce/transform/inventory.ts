/**
 * BetterCommerce Inventory → canonical InventoryLevel.
 *
 * BetterCommerce exposes stock through `currentStock` on product / variant
 * records. There is no separate inventory-level ledger endpoint; instead we
 * synthesise inventory levels from the product/variant stock data.
 *
 * The canonical `id` is synthesised as `${variantId}:${locationId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawBCInventoryItem {
  recordId?: string
  productId?: string
  stockCode?: string
  currentStock?: number | null
  locationId?: string | null
  updatedAt?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawBCInventoryItem,
  locationId: string = 'default',
): InventoryLevel {
  const variantId = raw.recordId ?? raw.productId ?? raw.stockCode ?? ''
  const loc = raw.locationId ?? locationId
  return {
    id: `${variantId}:${loc}`,
    variantId,
    locationId: loc,
    available: raw.currentStock ?? 0,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
