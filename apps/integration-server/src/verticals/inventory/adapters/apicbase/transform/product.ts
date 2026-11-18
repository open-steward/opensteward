import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

/**
 * Apicbase ingredient — the F&B platform's equivalent of a product/stock item.
 *
 * List endpoint:  GET /api/v2/products/ingredients/
 * Detail endpoint: GET /api/v2/products/ingredients/{uid}/
 *
 * Key fields (snake_case, DRF-style):
 *   uid            — Apicbase internal UUID
 *   internal_uid   — user-defined reference code (acts as SKU)
 *   name           — ingredient name in native language
 *   short_name     — abbreviated name
 *   category       — primary category string
 *   subcategory    — subcategory string
 *   in_use         — whether ingredient is active/not archived
 *   approved       — QA flag
 *   created_date   — ISO datetime
 *   modified_date  — ISO datetime
 *   archived_on    — ISO datetime or null
 *   supplier       — linked supplier ID (string or nested object)
 *   unit           — default purchase unit
 */
export interface RawApicbaseIngredient {
  uid: string
  internal_uid?: string
  name?: string
  short_name?: string
  category?: string
  subcategory?: string
  in_use?: boolean
  approved?: boolean
  created_date?: string
  modified_date?: string
  archived_on?: string | null
  supplier?: string | { uid?: string; id?: string; name?: string } | null
  unit?: string | { name?: string }
  [key: string]: unknown
}

function supplierId(raw: RawApicbaseIngredient): string | undefined {
  const s = raw.supplier
  if (!s) return undefined
  if (typeof s === 'string') return s
  if (typeof s === 'object') return pickStr(s.uid ?? s.id)
  return undefined
}

function unitOfMeasure(raw: RawApicbaseIngredient): string {
  const u = raw.unit
  if (!u) return 'each'
  if (typeof u === 'string') return u
  if (typeof u === 'object') return pickStr(u.name) ?? 'each'
  return 'each'
}

export function transformProduct(raw: RawApicbaseIngredient): Product {
  const sid = supplierId(raw)
  const isActive = raw.archived_on == null && (raw.in_use !== false)

  return {
    id: raw.uid,
    externalId: raw.uid,
    sku: pickStr(raw.internal_uid) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.short_name),
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.category),
    unitOfMeasure: unitOfMeasure(raw),
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive,
    parentProductId: undefined,
    supplierIds: sid ? [sid] : [],
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'apicbase',
    metadata: strMap({
      subcategory: raw.subcategory,
      approved: raw.approved,
      archived_on: raw.archived_on,
    }),
    raw,
  }
}
