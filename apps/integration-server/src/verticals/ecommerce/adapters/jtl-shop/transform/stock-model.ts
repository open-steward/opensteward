/**
 * JTL-Shop REST `StockModel` (table `tartikelwarenlager`) → canonical InventoryLevel.
 *
 * From https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Models/StockModel.php:
 *
 *   "$attributes['productID']    = DataAttribute::create('kArtikel', 'int', null, false, true);"
 *   "$attributes['warehouseID']  = DataAttribute::create('kWarenlager', 'int', null, false, true);"
 *   "$attributes['stock']        = DataAttribute::create('fBestand', 'double', null, false);"
 *   "$attributes['procured']     = DataAttribute::create('fZulauf', 'double', null, false);"
 *
 * One row per (product, warehouse): the composite key is the row id. The REST
 * API has no variant resource, so the product id is the `variantId`, and the
 * warehouse id is the `locationId`. `stock` is a double; the canonical
 * `available` is a whole number ≥ 0, so a fractional or negative stock is
 * refused rather than rounded. `procured` (Zulauf, stock on order) maps to
 * `incoming` only when it is a whole number ≥ 0.
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface JtlStockModel {
  productID: number
  warehouseID: number
  stock: number
  procured?: number | null
  [key: string]: unknown
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

export function transformStockModel(raw: JtlStockModel): InventoryLevel {
  if (!isCount(raw.productID) || raw.productID === 0 || !isCount(raw.warehouseID)) {
    throw new Error(
      `JTL-Shop stock row has no usable key: productID=${JSON.stringify(raw.productID)}, warehouseID=${JSON.stringify(raw.warehouseID)}`,
    )
  }
  const key = `${raw.productID}:${raw.warehouseID}`
  if (!isCount(raw.stock)) {
    throw new Error(
      `JTL-Shop stock ${key} is ${JSON.stringify(raw.stock)}, not a whole number ≥ 0 the canonical available count can hold`,
    )
  }
  const out: InventoryLevel = {
    id: key,
    variantId: String(raw.productID),
    locationId: String(raw.warehouseID),
    available: raw.stock,
    metadata: { ...raw },
  }
  if (isCount(raw.procured)) out.incoming = raw.procured
  return out
}
