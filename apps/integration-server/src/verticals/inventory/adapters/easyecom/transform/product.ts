import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * EasyEcom product master record.
 * Fields sourced from EasyEcom API /inventory/getProductMaster response.
 */
export interface RawEasyEcomProduct {
  product_id: string
  sku?: string
  product_name?: string
  description?: string
  barcode?: string
  brand?: string
  category?: string
  sub_category?: string
  product_type?: string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  mrp?: number | string
  selling_price?: number | string
  currency?: string
  is_active?: boolean | string | number
  parent_sku?: string
  vendor_id?: string | number
  vendor_name?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawEasyEcomProduct): Product {
  const id = String(raw.product_id)
  const weight = pickNum(raw.weight)
  const length = pickNum(raw.length)
  const width = pickNum(raw.width)
  const height = pickNum(raw.height)
  const mrp = pickNum(raw.mrp)
  const supplierIds = raw.vendor_id ? [String(raw.vendor_id)] : []

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.product_name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams: weight !== undefined ? weight * 1000 : undefined,
    dimensionsCm: length || width || height ? { length, width, height } : undefined,
    retailPrice: mrp !== undefined ? { amount: Math.round(mrp * 100), currency: pickStr(raw.currency) ?? 'INR' } : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId: pickStr(raw.parent_sku),
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'easyecom',
    metadata: strMap({
      productType: raw.product_type,
      subCategory: raw.sub_category,
      vendorName: raw.vendor_name,
      sellingPrice: raw.selling_price,
    }),
    raw,
  }
}
