import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Raw Part record from InvenTree GET /api/part/ or GET /api/part/{id}/
 * Source: InvenTree API schema v265, Part schema.
 */
export interface RawInvenTreePart {
  pk: number
  name?: string
  full_name?: string
  description?: string
  IPN?: string             // Internal Part Number — used as SKU
  barcode_hash?: string
  category?: number | null
  category_name?: string
  default_location?: number | null
  default_supplier?: number | null
  units?: string
  active?: boolean
  is_template?: boolean
  variant_of?: number | null
  creation_date?: string
  pricing_min?: string | null
  pricing_max?: string | null
  in_stock?: number
  suppliers?: number
  tags?: string[]
  [key: string]: unknown
}

export function transformProduct(raw: RawInvenTreePart): Product {
  const id = String(raw.pk)
  return {
    id,
    externalId: id,
    sku: pickStr(raw.IPN) ?? '',
    name: pickStr(raw.full_name) ?? pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.category_name),
    unitOfMeasure: pickStr(raw.units) ?? 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    // pricing_min/max are decimal strings (e.g. "12.50"); store as metadata — currency unknown
    retailPrice: undefined,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: raw.variant_of != null ? String(raw.variant_of) : undefined,
    supplierIds: raw.default_supplier != null ? [String(raw.default_supplier)] : [],
    createdAt: toIso(raw.creation_date),
    updatedAt: undefined,
    platform: 'inventree',
    metadata: strMap({
      categoryId: raw.category,
      defaultLocationId: raw.default_location,
      isTemplate: raw.is_template,
      inStock: raw.in_stock,
      suppliersCount: raw.suppliers,
      pricingMin: raw.pricing_min,
      pricingMax: raw.pricing_max,
    }),
    raw,
  }
}
