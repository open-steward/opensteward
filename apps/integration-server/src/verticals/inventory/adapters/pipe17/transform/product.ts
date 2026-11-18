/**
 * Pipe17 /items endpoint -> Product schema.
 *
 * Pipe17 uses camelCase field names. Key fields:
 *   productId, sku, name, description, status, inventoryNotTracked,
 *   parentExtProductId, tags, types, weight, upc, createdAt, updatedAt
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, pickNum, strMap, toIso} from './shared'

export interface RawPipe17Item {
  productId?: string
  sku?: string
  name?: string
  description?: string
  status?: string
  inventoryNotTracked?: boolean
  parentExtProductId?: string
  tags?: string[]
  types?: string[]
  weight?: number
  weightUnit?: string
  upc?: string
  barcode?: string
  brand?: string
  category?: string
  unitOfMeasure?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPipe17Item): Product {
  const id = pickStr(raw.productId) ?? pickStr(raw.sku) ?? ''
  const isActive = raw.status ? raw.status.toLowerCase() !== 'inactive' && raw.status.toLowerCase() !== 'archived' : !(pickBool(raw.inventoryNotTracked) ?? false)

  // weight: Pipe17 stores in lbs by default; convert to grams (1 lb = 453.592 g)
  let weightGrams: number | undefined
  if (raw.weight !== undefined) {
    const unit = (raw.weightUnit ?? 'lb').toLowerCase()
    const w = pickNum(raw.weight)
    if (w !== undefined) {
      weightGrams = unit === 'kg' ? w * 1000 : unit === 'g' ? w : w * 453.592
    }
  }

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc) ?? pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams,
    isActive,
    supplierIds: [],
    parentProductId: pickStr(raw.parentExtProductId),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'pipe17',
    metadata: strMap({
      status: raw.status,
      types: Array.isArray(raw.types) ? raw.types.join(',') : raw.types,
      tags: Array.isArray(raw.tags) ? raw.tags.join(',') : raw.tags,
      inventoryNotTracked: raw.inventoryNotTracked,
    }),
    raw,
  }
}
