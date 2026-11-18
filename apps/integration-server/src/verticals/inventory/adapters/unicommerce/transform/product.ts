/**
 * Transform Unicommerce itemTypeDTO → canonical Product.
 *
 * Source endpoints:
 *   POST /services/rest/v1/catalog/itemType/get       → itemTypeDTO
 *   POST /services/rest/v1/product/itemType/search    → elements[]
 *
 * Unicommerce uses grams for weight, centimetres for dimensions.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawUnicommerceProduct {
  id?: number
  skuCode?: string
  name?: string
  description?: string
  scanIdentifier?: string
  ean?: string
  upc?: string
  isbn?: string
  brand?: string
  color?: string
  size?: string
  categoryCode?: string
  categoryName?: string
  type?: string
  skuType?: string
  length?: number
  width?: number
  height?: number
  weight?: number
  maxRetailPrice?: number
  basePrice?: number
  costPrice?: number
  enabled?: boolean
  expirable?: boolean
  shelfLife?: number
  hsnCode?: string
  taxTypeCode?: string
  gstTaxTypeCode?: string
  imageUrl?: string
  productPageUrl?: string
  tags?: string[]
  created?: number | string
  updated?: number | string
  [key: string]: unknown
}

export function transformProduct(raw: RawUnicommerceProduct): Product {
  const skuCode = pickStr(raw.skuCode) ?? String(raw.id ?? '')

  return {
    id: skuCode,
    externalId: skuCode,
    sku: skuCode,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc) ?? pickStr(raw.ean) ?? pickStr(raw.scanIdentifier),
    brand: pickStr(raw.brand),
    category: pickStr(raw.categoryName) ?? pickStr(raw.categoryCode),
    unitOfMeasure: 'each',
    // Unicommerce stores weight in grams already
    weightGrams: pickNum(raw.weight),
    dimensionsCm: raw.length || raw.width || raw.height
      ? { length: raw.length, width: raw.width, height: raw.height }
      : undefined,
    retailPrice: raw.maxRetailPrice !== undefined
      ? { amount: raw.maxRetailPrice, currency: 'INR' }
      : undefined,
    isActive: pickBool(raw.enabled) ?? true,
    supplierIds: [],
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'unicommerce',
    metadata: strMap({
      type: raw.type,
      skuType: raw.skuType,
      color: raw.color,
      size: raw.size,
      hsnCode: raw.hsnCode,
      taxTypeCode: raw.taxTypeCode,
      gstTaxTypeCode: raw.gstTaxTypeCode,
      expirable: raw.expirable,
      shelfLife: raw.shelfLife,
      tags: Array.isArray(raw.tags) ? raw.tags.join(',') : undefined,
    }),
    raw,
  }
}
