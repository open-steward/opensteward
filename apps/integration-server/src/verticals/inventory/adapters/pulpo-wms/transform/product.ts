import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Raw product shape from GET /api/v1/products (PULPO WMS).
 * Field names sourced from the PULPO WMS Swagger UI at eu.pulpo.co/api/v1/swagger.
 */
export interface RawPulpoWmsProduct {
  id: string
  sku?: string
  name?: string
  description?: string
  barcode?: string
  barcode_type?: string
  brand?: string
  category?: string
  product_type?: string
  weight?: number
  weight_unit?: string
  length?: number
  width?: number
  height?: number
  dimension_unit?: string
  sale_price?: number
  currency?: string
  is_active?: boolean | string
  parent_id?: string
  supplier_id?: string
  supplier_ids?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPulpoWmsProduct): Product {
  const supplierIds: string[] = []
  if (raw.supplier_id) supplierIds.push(raw.supplier_id)
  for (const sid of raw.supplier_ids ?? []) {
    if (sid && !supplierIds.includes(sid)) supplierIds.push(sid)
  }

  // Normalise weight to grams: PULPO stores weight in kg by default
  let weightGrams: number | undefined
  if (raw.weight !== undefined) {
    const unit = (raw.weight_unit ?? 'kg').toLowerCase()
    if (unit === 'g' || unit === 'gram' || unit === 'grams') {
      weightGrams = raw.weight
    } else {
      // default kg → grams
      weightGrams = raw.weight * 1000
    }
  }

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm: raw.length || raw.width || raw.height ? {
      length: raw.length,
      width: raw.width,
      height: raw.height,
    } : undefined,
    retailPrice: raw.sale_price !== undefined
      ? { amount: raw.sale_price, currency: pickStr(raw.currency) ?? 'EUR' }
      : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    parentProductId: pickStr(raw.parent_id),
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'pulpo-wms',
    metadata: strMap({
      product_type: raw.product_type,
      barcode_type: raw.barcode_type,
      dimension_unit: raw.dimension_unit,
      weight_unit: raw.weight_unit,
    }),
    raw,
  }
}
