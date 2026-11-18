/**
 * Supy "item" → canonical Product transform.
 *
 * Supy calls inventory items "items" internally. The Open API response shape
 * uses camelCase keys with a flat structure common to F&B platforms. Costs are
 * stored as decimal amounts in the platform currency; we do NOT convert to
 * minor units here because the schema stores amounts as plain numbers for
 * inventory cost reference data (not payment amounts).
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawSupyItem {
  id: string
  sku?: string
  name?: string
  description?: string
  barcode?: string
  category?: string
  subcategory?: string
  unitOfMeasure?: string
  unitSize?: number
  costPrice?: number
  currency?: string
  isActive?: boolean | string
  supplierId?: string
  supplierName?: string
  imageUrl?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSupyItem): Product {
  const supplierIds: string[] = []
  if (raw.supplierId) supplierIds.push(String(raw.supplierId))

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: undefined,
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: raw.costPrice !== undefined
      ? { amount: pickNum(raw.costPrice) ?? 0, currency: pickStr(raw.currency) ?? 'USD' }
      : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'supy',
    metadata: strMap({
      category: raw.category,
      subcategory: raw.subcategory,
      unitSize: raw.unitSize,
      supplierName: raw.supplierName,
    }),
    raw,
  }
}
