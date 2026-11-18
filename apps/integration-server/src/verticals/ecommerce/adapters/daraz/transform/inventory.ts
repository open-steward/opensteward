/**
 * Daraz SKU stock → canonical InventoryLevel.
 *
 * Daraz stock is managed at the SKU level. The `/product/stock/sellable/get`
 * endpoint returns sellable stock per SKU. Stock updates go through
 * `/product/price_quantity/update`.
 *
 * Daraz does not expose location-level inventory, so we use a synthetic
 * `daraz-default` location ID.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawDarazStockItem {
  seller_sku?: string
  shop_sku?: string
  sku_id?: number | string
  sellable_quantity?: number
  quantity?: number
  reserved_stock?: number
  fulfillment_by_non_sellable?: number
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'daraz-default'

/**
 * Daraz stock item → canonical InventoryLevel.
 *
 * The `variantId` is the `sku_id` or `seller_sku`. `available` is the
 * sellable quantity. `committed` maps to reserved stock.
 */
export function transformInventoryLevel(raw: RawDarazStockItem): InventoryLevel {
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
