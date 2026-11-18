/**
 * Jumia SKU stock → canonical InventoryLevel.
 *
 * Jumia stock is managed at the SKU/variation level. The `/products/stock`
 * endpoint returns stock per SKU. Stock updates go through PUT on the same
 * endpoint.
 *
 * Jumia does not expose location-level inventory, so we use a synthetic
 * `jumia-default` location ID.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawJumiaStockItem {
  seller_sku?: string
  sku_id?: string | number
  product_id?: string | number
  available_quantity?: number
  quantity?: number
  reserved_quantity?: number
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'jumia-default'

/**
 * Jumia stock item → canonical InventoryLevel.
 *
 * The `variantId` is the `sku_id` or `seller_sku`. `available` is the
 * available quantity. `committed` maps to reserved quantity.
 */
export function transformInventoryLevel(raw: RawJumiaStockItem): InventoryLevel {
  const variantId = String(raw.sku_id ?? raw.seller_sku ?? '')
  const available = raw.available_quantity ?? raw.quantity ?? 0
  const committed = raw.reserved_quantity

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
