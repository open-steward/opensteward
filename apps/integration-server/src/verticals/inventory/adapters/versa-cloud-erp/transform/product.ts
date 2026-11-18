/**
 * Versa Cloud ERP — product (item) transform.
 *
 * API endpoint: GET /item.json
 * Key response fields (Versa uses "item" terminology):
 *   id, part_number, item_name, description, sku, barcode,
 *   item_type, category_name, brand_name, uom,
 *   weight, length, width, height,
 *   cost_price, sell_price_1, currency,
 *   is_active, parent_item_id,
 *   default_vendor_id, created_at, updated_at
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawVersaProduct {
  id: string | number
  part_number?: string
  item_name?: string
  description?: string
  sku?: string
  barcode?: string
  item_type?: string
  category_name?: string
  brand_name?: string
  uom?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  /** Sell price in account currency — stored as floating-point decimal */
  sell_price_1?: number | string
  cost_price?: number | string
  currency?: string
  is_active?: boolean | number | string
  parent_item_id?: string | number | null
  default_vendor_id?: string | number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawVersaProduct): Product {
  const id = String(raw.id)
  const weightGrams =
    raw.weight !== undefined ? (pickNum(raw.weight) ?? 0) * 1000 : undefined

  const len = pickNum(raw.length)
  const wid = pickNum(raw.width)
  const hei = pickNum(raw.height)

  // Versa stores prices as decimal; convert to integer minor units (cents)
  const sellPriceDecimal = pickNum(raw.sell_price_1)
  const retailPrice =
    sellPriceDecimal !== undefined
      ? { amount: Math.round(sellPriceDecimal * 100), currency: pickStr(raw.currency) ?? 'USD' }
      : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.part_number) ?? pickStr(raw.sku) ?? '',
    name: pickStr(raw.item_name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand_name),
    category: pickStr(raw.category_name),
    unitOfMeasure: pickStr(raw.uom) ?? 'each',
    weightGrams,
    dimensionsCm: len || wid || hei ? { length: len, width: wid, height: hei } : undefined,
    retailPrice,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId:
      raw.parent_item_id != null ? String(raw.parent_item_id) : undefined,
    supplierIds: raw.default_vendor_id != null ? [String(raw.default_vendor_id)] : [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'versa-cloud-erp',
    metadata: strMap({ item_type: raw.item_type }),
    raw,
  }
}
