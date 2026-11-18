/**
 * Shopee stock info → canonical InventoryLevel.
 *
 * Shopee stock is managed at the item/model level. The
 * `/api/v2/product/get_item_base_info` response includes `stock_info_v2`
 * with available and reserved stock counts. For items with models,
 * each model has its own stock info.
 *
 * There is no separate "location" concept — Shopee manages warehouses
 * internally. We use `shopee-default` as a synthetic location id.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeStockSummary {
  total_available_stock?: number
  total_reserved_stock?: number
}

export interface RawShopeeSellerStock {
  stock?: number
}

export interface RawShopeeStockInfoV2 {
  summary_info?: RawShopeeStockSummary
  seller_stock?: RawShopeeSellerStock[]
}

export interface RawShopeeInventoryItem {
  item_id: number
  model_id?: number
  item_sku?: string
  model_sku?: string
  stock_info_v2?: RawShopeeStockInfoV2
  update_time?: number
  [key: string]: unknown
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'shopee-default'

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawShopeeInventoryItem): InventoryLevel {
  const summary = raw.stock_info_v2?.summary_info
  const available = summary?.total_available_stock ?? 0
  const committed = summary?.total_reserved_stock

  // The variant id is the model_id if present, otherwise the item_id
  const variantId = raw.model_id != null
    ? String(raw.model_id)
    : String(raw.item_id)

  return {
    id: `${variantId}:${DEFAULT_LOCATION_ID}`,
    variantId,
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed,
    onHand: committed != null ? available + committed : undefined,
    updatedAt: raw.update_time
      ? new Date(raw.update_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
