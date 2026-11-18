import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Sellbrite product shape — from GET /products and GET /products/:sku.
 * Field names follow Sellbrite's API (snake_case).
 */
export interface RawSellbriteProduct {
  sku: string
  name?: string
  description?: string
  brand?: string
  manufacturer?: string
  manufacturer_model_number?: string
  price?: number | string
  cost?: number | string
  msrp?: number | string
  category_name?: string
  upc?: string
  ean?: string
  isbn?: string
  gtin?: string
  asin?: string
  epid?: string
  condition?: string
  condition_note?: string
  notes?: string
  package_length?: number | string
  package_width?: number | string
  package_height?: number | string
  package_unit_of_length?: string
  package_weight?: number | string
  package_unit_of_weight?: string
  /** child variation SKUs */
  variations?: RawSellbriteProduct[]
  /** set on child variants */
  parent_sku?: string
  /** custom key-value attributes */
  custom_attributes?: Record<string, unknown>
  created_at?: string
  modified_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSellbriteProduct): Product {
  // Convert price: Sellbrite returns decimal dollars → store in minor units (cents) as integer
  const priceDecimal = pickNum(raw.price)
  const retailPriceMinor = priceDecimal !== undefined ? Math.round(priceDecimal * 100) : undefined

  // Convert cost: same decimal-dollar → cents conversion as price
  const costDecimal = pickNum(raw.cost)
  const costMinor = costDecimal !== undefined ? Math.round(costDecimal * 100) : undefined

  // Weight: Sellbrite gives package_weight in the unit package_unit_of_weight (usually "lb" or "oz")
  // We store in grams. Default assume "lb" if unit absent.
  const weightRaw = pickNum(raw.package_weight)
  let weightGrams: number | undefined
  if (weightRaw !== undefined) {
    const unit = (raw.package_unit_of_weight ?? 'lb').toLowerCase()
    if (unit === 'kg') weightGrams = weightRaw * 1000
    else if (unit === 'oz') weightGrams = weightRaw * 28.3495
    else weightGrams = weightRaw * 453.592 // lb default
    weightGrams = Math.round(weightGrams)
  }

  // Dimensions: Sellbrite gives length/width/height in package_unit_of_length (usually "in" or "cm")
  const len = pickNum(raw.package_length)
  const wid = pickNum(raw.package_width)
  const hgt = pickNum(raw.package_height)
  let dimensionsCm: { length?: number; width?: number; height?: number } | undefined
  if (len !== undefined || wid !== undefined || hgt !== undefined) {
    const unit = (raw.package_unit_of_length ?? 'in').toLowerCase()
    const factor = unit === 'cm' ? 1 : 2.54 // inches to cm
    dimensionsCm = {
      length: len !== undefined ? Math.round(len * factor * 100) / 100 : undefined,
      width: wid !== undefined ? Math.round(wid * factor * 100) / 100 : undefined,
      height: hgt !== undefined ? Math.round(hgt * factor * 100) / 100 : undefined,
    }
  }

  return {
    id: raw.sku,
    externalId: raw.sku,
    sku: raw.sku,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc),
    isbn: pickStr(raw.isbn),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category_name),
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm,
    cost: costMinor !== undefined ? { amount: costMinor, currency: 'USD' } : undefined,
    retailPrice: retailPriceMinor !== undefined ? { amount: retailPriceMinor, currency: 'USD' } : undefined,
    isActive: true, // Sellbrite has no active/inactive flag on products
    parentProductId: pickStr(raw.parent_sku),
    supplierIds: [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'sellbrite',
    metadata: strMap({
      asin: raw.asin,
      ean: raw.ean,
      gtin: raw.gtin,
      epid: raw.epid,
      msrp: raw.msrp,
      condition: raw.condition,
      manufacturer: raw.manufacturer,
      manufacturerModelNumber: raw.manufacturer_model_number,
    }),
    raw,
  }
}
