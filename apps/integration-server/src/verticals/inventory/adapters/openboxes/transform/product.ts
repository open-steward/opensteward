import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * OpenBoxes product object returned from:
 *   GET /openboxes/api/products
 *   GET /openboxes/api/generic/product
 *
 * Response envelope: { data: RawOpenboxesProduct[] }
 */
export interface RawOpenboxesProduct {
  id: string
  productCode?: string | null
  name?: string | null
  description?: string | null
  category?: { id?: string; name?: string } | null
  unitOfMeasure?: string | null
  active?: boolean | null
  dateCreated?: string | null
  lastUpdated?: string | null
  [key: string]: unknown
}

export function transformProduct(raw: RawOpenboxesProduct): Product {
  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.productCode) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    category: pickStr(raw.category?.name),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    isActive: pickBool(raw.active) ?? true,
    supplierIds: [],
    createdAt: toIso(raw.dateCreated),
    updatedAt: toIso(raw.lastUpdated),
    platform: 'openboxes',
    metadata: strMap({ categoryId: raw.category?.id }),
    raw,
  }
}
