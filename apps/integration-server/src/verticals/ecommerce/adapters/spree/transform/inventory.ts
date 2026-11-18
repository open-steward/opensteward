/**
 * Spree StockItem → canonical InventoryLevel.
 *
 * Spree tracks inventory via "stock items" under
 * `/api/v2/platform/stock_items`. Each stock item connects a variant
 * to a stock location with a `count_on_hand` quantity and
 * `backorderable` flag.
 *
 * Canonical id is synthesized as `${variant_id}:${stock_location_id}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSpreeStockItem {
  id: number | string
  variant_id: number | string
  stock_location_id: number | string
  count_on_hand?: number
  backorderable?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawSpreeStockItem): InventoryLevel {
  return {
    id: `${raw.variant_id}:${raw.stock_location_id}`,
    variantId: String(raw.variant_id),
    locationId: String(raw.stock_location_id),
    available: raw.count_on_hand ?? 0,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
