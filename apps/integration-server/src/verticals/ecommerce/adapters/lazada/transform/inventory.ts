/**
 * Lazada SKU stock → canonical InventoryLevel.
 *
 * Lazada stock is managed at the SKU level. The `/product/stock/sellable/get`
 * endpoint returns sellable stock per SKU. Stock updates go through
 * `/product/price_quantity/update`.
 *
 * Lazada does not expose location-level inventory, so we use a synthetic
 * `lazada-default` location ID (similar to Amazon's FBA approach).
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawLazadaStockItem {
  seller_sku?: string
  shop_sku?: string
  sku_id?: number | string
  sellable_quantity?: number
  quantity?: number
  reserved_stock?: number
  fulfillment_by_non_sellable?: number
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'lazada-default'

/**
 * Lazada stock item → canonical InventoryLevel.
 *
 * The `variantId` is the `sku_id` or `seller_sku`. `available` is the
 * sellable quantity. `committed` maps to reserved stock.
 */
export function transformInventoryLevel(raw: RawLazadaStockItem): InventoryLevel {
  const variantId = String(raw.sku_id ?? raw.seller_sku ?? '')
  const available = raw.sellable_quantity ?? raw.quantity ?? 0
  const committed = raw.reserved_stock

  return {
    id: `${variantId}:${DEFAULT_LOCATION_ID}`,
    variantId,
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed,
    onHand: committed != null ? available + committed : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
