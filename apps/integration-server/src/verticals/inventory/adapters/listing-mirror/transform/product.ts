import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Listing Mirror v3 product object.
 * GET /v3/products/ returns parent products with nested `variations` array.
 * Each variation has its own `sku`, `quantity`, and optional attributes.
 */
export interface RawListingMirrorVariation {
  id?: string | number
  sku?: string
  quantity?: number
  price?: number
  [key: string]: unknown
}

export interface RawListingMirrorProduct {
  id?: string | number
  sku?: string
  title?: string
  description?: string
  brand?: string
  price?: number
  isActive?: boolean | string
  variations?: RawListingMirrorVariation[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawListingMirrorProduct): Product {
  const id = String(raw.id ?? raw.sku ?? '')
  const priceValue = pickNum(raw.price)
  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    brand: pickStr(raw.brand),
    unitOfMeasure: 'each',
    // Listing Mirror prices are decimal (e.g. 49.99); convert to integer cents
    retailPrice: priceValue !== undefined
      ? { amount: Math.round(priceValue * 100), currency: 'USD' }
      : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    supplierIds: [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'listing-mirror',
    metadata: strMap({}),
    raw,
  }
}

/**
 * Transform a variation into a child Product.
 * The parent's id is passed as parentProductId.
 */
export function transformVariation(
  raw: RawListingMirrorVariation,
  parentId: string,
): Product {
  const id = String(raw.id ?? raw.sku ?? '')
  const priceValue = pickNum(raw.price)
  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.sku) ?? '',
    unitOfMeasure: 'each',
    retailPrice: priceValue !== undefined
      ? { amount: Math.round(priceValue * 100), currency: 'USD' }
      : undefined,
    isActive: true,
    parentProductId: parentId,
    supplierIds: [],
    platform: 'listing-mirror',
    metadata: strMap({}),
    raw,
  }
}
