/**
 * Transform ECCANG goods (商品) records to the canonical Product schema.
 *
 * ECCANG field names follow the Open API SDK response shape.
 * Prices arrive as decimal numbers; they are stored as-is in `retailPrice.amount`
 * because no reliable minor-unit multiplier can be inferred without knowing
 * the store's currency configuration.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawEccangProduct {
  /** Unique goods ID in ECCANG */
  goods_id?: string | number
  goods_no?: string
  goods_name?: string
  goods_desc?: string
  bar_code?: string
  brand?: string
  category_name?: string
  goods_type?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  sale_price?: number | string
  cost_price?: number | string
  currency?: string
  is_enabled?: boolean | string | number
  parent_goods_id?: string | number
  /** SKU-level identifier when response is a flat SKU row */
  sku_id?: string | number
  sku_no?: string
  create_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawEccangProduct): Product {
  const id = String(raw.goods_id ?? raw.sku_id ?? '')
  const priceRaw = pickNum(raw.sale_price)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku_no ?? raw.goods_no) ?? '',
    name: pickStr(raw.goods_name) ?? '',
    description: pickStr(raw.goods_desc),
    upc: pickStr(raw.bar_code),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category_name),
    unitOfMeasure: 'each',
    weightGrams: raw.weight !== undefined ? (pickNum(raw.weight) ?? 0) * 1000 : undefined,
    dimensionsCm: (raw.length || raw.width || raw.height) ? {
      length: pickNum(raw.length),
      width: pickNum(raw.width),
      height: pickNum(raw.height),
    } : undefined,
    retailPrice: priceRaw !== undefined ? { amount: priceRaw, currency: pickStr(raw.currency) ?? 'CNY' } : undefined,
    isActive: pickBool(raw.is_enabled) ?? true,
    parentProductId: raw.parent_goods_id ? String(raw.parent_goods_id) : undefined,
    supplierIds: [],
    createdAt: toIso(raw.create_time),
    updatedAt: toIso(raw.update_time),
    platform: 'eccang',
    metadata: strMap({
      goodsType: raw.goods_type,
      costPrice: raw.cost_price,
      currency: raw.currency,
    }),
    raw,
  }
}
