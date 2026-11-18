import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Sumtracker product object as returned by GET /products or GET /products/:id.
 * Field names are snake_case, consistent with Sumtracker's Rails-derived API.
 */
export interface RawSumtrackerProduct {
  id: string | number
  sku?: string
  name?: string
  description?: string
  barcode?: string
  brand?: string
  category?: string
  product_type?: string
  unit?: string
  weight?: number
  weight_unit?: string
  length?: number
  width?: number
  height?: number
  dimension_unit?: string
  selling_price?: number | string
  currency?: string
  is_active?: boolean | string | number
  is_bundle?: boolean | string | number
  parent_id?: string | number
  supplier_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSumtrackerProduct): Product {
  const id = String(raw.id)

  // Convert weight to grams (Sumtracker stores in kg or lbs depending on account setting)
  let weightGrams: number | undefined
  if (raw.weight !== undefined) {
    const unit = (raw.weight_unit ?? 'kg').toLowerCase()
    if (unit === 'lb' || unit === 'lbs') {
      weightGrams = raw.weight * 453.592
    } else {
      // default kg
      weightGrams = raw.weight * 1000
    }
  }

  // Dimensions — stored in cm
  const hasDimensions = raw.length || raw.width || raw.height
  const dimensionsCm = hasDimensions
    ? { length: pickNum(raw.length), width: pickNum(raw.width), height: pickNum(raw.height) }
    : undefined

  // Selling price — store in minor units if numeric
  const priceNum = pickNum(raw.selling_price)
  const retailPrice = priceNum !== undefined
    ? { amount: Math.round(priceNum * 100), currency: pickStr(raw.currency) ?? 'USD' }
    : undefined

  const supplierIds = raw.supplier_id !== undefined ? [String(raw.supplier_id)] : []

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unit) ?? 'each',
    weightGrams,
    dimensionsCm,
    retailPrice,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId: raw.parent_id !== undefined ? String(raw.parent_id) : undefined,
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'sumtracker',
    metadata: strMap({
      product_type: raw.product_type,
      weight_unit: raw.weight_unit,
      dimension_unit: raw.dimension_unit,
      is_bundle: raw.is_bundle,
    }),
    raw,
  }
}
