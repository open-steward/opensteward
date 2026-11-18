/**
 * Webflow Inventory → canonical InventoryLevel.
 *
 * Webflow exposes inventory per-SKU (not per-location). The
 * `/sites/{siteId}/products/{productId}/skus/{skuId}/inventory` endpoint
 * returns a single inventory record with `quantity`.
 *
 * Because Webflow is single-location, we use the siteId as the locationId
 * and the skuId as the variantId. The synthetic id is `${skuId}:${siteId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawWebflowInventory {
  _id?: string
  id?: string
  quantity?: number
  inventoryType?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawWebflowInventory,
  skuId: string,
  siteId: string,
): InventoryLevel {
  const id = raw._id ?? raw.id ?? `${skuId}:${siteId}`
  return {
    id,
    variantId: skuId,
    locationId: siteId,
    available: raw.quantity ?? 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
