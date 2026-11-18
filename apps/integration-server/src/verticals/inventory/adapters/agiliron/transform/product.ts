import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Raw shape returned by GET /Products in Agiliron API v4.0.
 *
 * The response envelope is:
 *   { Products: { Product: RawAgilironProduct[] }, TotalRecords, CurrentPage, ... }
 *
 * Relevant field reference: https://api.agiliron.com/docs/read-product-1.md
 */
export interface RawAgilironProduct {
  ProductId: string
  ProductCode?: string
  ProductName?: string
  Description?: string
  Barcode?: string
  Manufacturer?: string
  ProductCategory?: string
  ProductType?: string
  UsageUnit?: string
  WeightMajor?: number | string
  WeightMinor?: number | string
  Length?: number | string
  Width?: number | string
  Height?: number | string
  PreferredVendor?: string
  Discontinued?: boolean | string | number
  CreatedTime?: string
  ModifiedTime?: string
  ModifiedTimeUTC?: string
  CreatedTimeUTC?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawAgilironProduct): Product {
  // WeightMajor is pounds (lb), WeightMinor is the fraction; convert total to grams.
  const lbs = (pickNum(raw.WeightMajor) ?? 0) + (pickNum(raw.WeightMinor) ?? 0) / 100
  const weightGrams = lbs > 0 ? Math.round(lbs * 453.592) : undefined

  const isDiscontinued = pickBool(raw.Discontinued) ?? false

  return {
    id: raw.ProductId,
    externalId: raw.ProductId,
    sku: pickStr(raw.ProductCode) ?? '',
    name: pickStr(raw.ProductName) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.Barcode),
    brand: pickStr(raw.Manufacturer),
    category: pickStr(raw.ProductCategory),
    unitOfMeasure: pickStr(raw.UsageUnit) ?? 'each',
    weightGrams,
    dimensionsCm: raw.Length || raw.Width || raw.Height ? {
      length: pickNum(raw.Length),
      width: pickNum(raw.Width),
      height: pickNum(raw.Height),
    } : undefined,
    isActive: !isDiscontinued,
    supplierIds: raw.PreferredVendor ? [raw.PreferredVendor] : [],
    createdAt: toIso(raw.CreatedTimeUTC ?? raw.CreatedTime),
    updatedAt: toIso(raw.ModifiedTimeUTC ?? raw.ModifiedTime),
    platform: 'agiliron',
    metadata: strMap({ productType: raw.ProductType }),
    raw,
  }
}

/** Agiliron GET /Products response envelope */
export interface AgilironProductsEnvelope {
  Products?: { Product?: RawAgilironProduct[] }
  TotalRecords?: number
  CurrentPage?: number
  TotalPages?: number
  PageSize?: number
}
