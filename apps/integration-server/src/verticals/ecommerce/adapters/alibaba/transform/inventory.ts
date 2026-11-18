/**
 * Alibaba.com SKU inventory → canonical InventoryLevel.
 *
 * Source: alibaba.icbu.product.inventory.get (/icbu/product/inventory/get,
 * cid=1), "Get product inventory information", called per product. Its
 * documented `result.data_list[]`:
 *   sku_id          [Number] "sku_id"
 *   inventory_code  [String] "inventory_code"
 *   inventory       [Number] "inventory"
 *   sku_outer_id    [String] "sku_outer_id"
 * (example row: sku_id "33323", inventory "100", sku_outer_id "Red",
 * inventory_code "CN_LOCAL_01").
 *
 * A SKU's stock is reported per `inventory_code`, which is the only
 * location-like key the API returns, so it is the canonical `locationId` and
 * the id is `${sku_id}:${inventory_code}` as the schema prescribes for
 * platforms without their own. A row missing either, or a whole non-negative
 * `inventory`, has no canonical form and is refused rather than filled in.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawAlibabaInventoryRow {
  sku_id?: number | string
  inventory_code?: string
  inventory?: number | string
  sku_outer_id?: string
  [key: string]: unknown
}

export function inventoryLevelId(skuId: string, inventoryCode: string): string {
  return `${skuId}:${inventoryCode}`
}

export function transformInventoryLevel(
  raw: RawAlibabaInventoryRow,
  productId: string,
): InventoryLevel {
  const available = Number(raw.inventory)
  if (
    raw.sku_id == null ||
    raw.sku_id === '' ||
    !raw.inventory_code ||
    raw.inventory == null ||
    raw.inventory === '' ||
    !Number.isInteger(available) ||
    available < 0
  ) {
    throw new Error(
      `Alibaba inventory.get for product ${productId}: a data_list row lacks sku_id, ` +
        `inventory_code or a whole inventory (${JSON.stringify(raw)})`,
    )
  }
  const variantId = String(raw.sku_id)
  return {
    id: inventoryLevelId(variantId, raw.inventory_code),
    variantId,
    locationId: raw.inventory_code,
    available,
    metadata: { ...raw, productId },
  }
}
