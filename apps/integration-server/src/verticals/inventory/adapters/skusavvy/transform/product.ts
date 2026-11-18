import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * SKUSavvy GraphQL product node.
 * Fields match the SKUSavvy GraphQL schema (camelCase).
 */
export interface RawSkusavvyProduct {
  id: string
  sku?: string
  name?: string
  description?: string
  barcode?: string
  brand?: string
  productType?: string
  weight?: number
  weightUnit?: string
  price?: number
  compareAtPrice?: number
  active?: boolean
  parentId?: string
  vendorId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSkusavvyProduct): Product {
  const supplierIds: string[] = []
  if (raw.vendorId) supplierIds.push(String(raw.vendorId))

  // SKUSavvy weight is in grams when weightUnit is 'g', kg when 'kg', lb when 'lb'
  let weightGrams: number | undefined
  if (raw.weight !== undefined) {
    const unit = (raw.weightUnit ?? '').toLowerCase()
    if (unit === 'kg') weightGrams = raw.weight * 1000
    else if (unit === 'lb') weightGrams = raw.weight * 453.592
    else weightGrams = raw.weight // assume grams
  }

  // price stored as decimal dollars — convert to integer minor units (cents)
  const retailCents = raw.price !== undefined ? Math.round(raw.price * 100) : undefined

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.productType),
    unitOfMeasure: 'each',
    weightGrams,
    retailPrice: retailCents !== undefined ? { amount: retailCents, currency: 'USD' } : undefined,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: pickStr(raw.parentId),
    supplierIds,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'skusavvy',
    metadata: strMap({ productType: raw.productType, weightUnit: raw.weightUnit }),
    raw,
  }
}
