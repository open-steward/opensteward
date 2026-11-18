/**
 * Transform a raw Jushuitan SKU record (/open/sku/query) into a canonical Product.
 *
 * Jushuitan field reference:
 *   sku_id     — internal numeric ID
 *   i_id       — item/SKU code (used as the external-facing SKU string)
 *   sku_name   — display name
 *   cat_name   — category name
 *   brand      — brand name
 *   spec       — spec / variant description
 *   weight     — weight in grams (g)
 *   length / width / height — dimensions in cm
 *   sale_price — selling price in CNY (minor units: fen = 0.01 CNY)
 *   enabled    — 1 = active
 *   supplier_id — default supplier external ID
 *   created    — creation datetime string
 *   modified   — last-modified datetime string
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawJushuitanProduct {
  sku_id: number | string
  i_id?: string
  sku_name?: string
  cat_name?: string
  brand?: string
  spec?: string
  barcode?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  sale_price?: number | string
  enabled?: number | string | boolean
  supplier_id?: number | string
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawJushuitanProduct): Product {
  const id = String(raw.sku_id)
  const salePriceFen = pickNum(raw.sale_price)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.i_id) ?? id,
    name: pickStr(raw.sku_name) ?? '',
    description: pickStr(raw.spec),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.cat_name),
    unitOfMeasure: 'each',
    // weight already in grams per Jushuitan docs
    weightGrams: pickNum(raw.weight),
    dimensionsCm:
      raw.length || raw.width || raw.height
        ? {
            length: pickNum(raw.length),
            width: pickNum(raw.width),
            height: pickNum(raw.height),
          }
        : undefined,
    // sale_price is in fen (integer minor units, CNY); keep as integer minor units
    retailPrice:
      salePriceFen !== undefined
        ? { amount: Math.round(salePriceFen), currency: 'CNY' }
        : undefined,
    isActive: pickBool(raw.enabled) ?? true,
    supplierIds: raw.supplier_id != null ? [String(raw.supplier_id)] : [],
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'jushuitan',
    metadata: strMap({ spec: raw.spec }),
    raw,
  }
}
