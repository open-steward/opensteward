/**
 * Jubelio product (item) transform.
 *
 * GET /inventory/items/        → {data: RawJubelioProduct[], count: number}
 * GET /inventory/items/{id}    → RawJubelioProduct
 *
 * Key fields sourced from Jubelio PHP client + API reference:
 *   item_id, item_code (SKU), item_name, description, unit, weight,
 *   sell_price, buy_price, is_active, item_group_id, item_group_name,
 *   created_date, modified_date
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawJubelioProduct {
  item_id: number | string
  item_code?: string
  item_name?: string
  description?: string
  unit?: string
  weight?: number | string
  sell_price?: number | string
  buy_price?: number | string
  is_active?: boolean | number | string
  item_group_id?: number | string
  item_group_name?: string
  brand?: string
  barcode?: string
  length?: number | string
  width?: number | string
  height?: number | string
  created_date?: string
  modified_date?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawJubelioProduct): Product {
  const id = String(raw.item_id)
  const weightKg = pickNum(raw.weight)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.item_code) ?? '',
    name: pickStr(raw.item_name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.item_group_name),
    unitOfMeasure: pickStr(raw.unit) ?? 'each',
    weightGrams: weightKg !== undefined ? weightKg * 1000 : undefined,
    dimensionsCm:
      raw.length != null || raw.width != null || raw.height != null
        ? {
            length: pickNum(raw.length),
            width: pickNum(raw.width),
            height: pickNum(raw.height),
          }
        : undefined,
    retailPrice:
      raw.sell_price != null
        ? { amount: pickNum(raw.sell_price) ?? 0, currency: 'IDR' }
        : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId: raw.item_group_id != null ? String(raw.item_group_id) : undefined,
    supplierIds: [],
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'jubelio',
    metadata: strMap({ buyPrice: raw.buy_price, itemGroupId: raw.item_group_id }),
    raw,
  }
}
