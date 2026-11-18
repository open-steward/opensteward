import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

/**
 * Raw product record from the SkuNexus REST API.
 * SkuNexus uses snake_case field names in its JSON responses.
 * Endpoint: GET /api/v1/products  (list) / GET /api/v1/products/:id (single)
 */
export interface RawSkuNexusProduct {
  id: string | number
  sku?: string
  name?: string
  description?: string
  upc?: string
  barcode?: string
  brand?: string
  category?: string
  product_type?: string
  unit_of_measure?: string
  weight?: number | string
  weight_unit?: string
  length?: number | string
  width?: number | string
  height?: number | string
  dimension_unit?: string
  unit_price?: number | string
  cost?: number | string
  currency?: string
  active?: boolean | string
  archived?: boolean | string
  parent_product_id?: string | number | null
  vendor_id?: string | number | null
  vendor_ids?: Array<string | number>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/** Convert a decimal weight in pounds/kg to grams. SkuNexus stores weights in lbs by default. */
function weightToGrams(raw: RawSkuNexusProduct): number | undefined {
  const w = pickNum(raw.weight)
  if (w === undefined) return undefined
  const unit = (raw.weight_unit ?? 'lb').toLowerCase()
  if (unit === 'kg' || unit === 'kilogram') return Math.round(w * 1000)
  if (unit === 'g' || unit === 'gram') return Math.round(w)
  // Default: pounds
  return Math.round(w * 453.592)
}

export function transformProduct(raw: RawSkuNexusProduct): Product {
  const id = String(raw.id)
  const supplierIds: string[] = []
  if (raw.vendor_id != null) supplierIds.push(String(raw.vendor_id))
  for (const vid of raw.vendor_ids ?? []) {
    const s = String(vid)
    if (!supplierIds.includes(s)) supplierIds.push(s)
  }

  const lNum = pickNum(raw.length)
  const wNum = pickNum(raw.width)
  const hNum = pickNum(raw.height)

  // Retail price stored as decimal dollars in SkuNexus; no minor-unit conversion needed
  // for the price field (schema allows decimal amounts for retail price context)
  const unitPrice = pickNum(raw.unit_price)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.upc) ?? pickStr(raw.barcode),
    brand: pickStr(raw.brand),
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unit_of_measure) ?? 'each',
    weightGrams: weightToGrams(raw),
    dimensionsCm: lNum || wNum || hNum ? {
      length: lNum, width: wNum, height: hNum,
    } : undefined,
    retailPrice: unitPrice !== undefined ? { amount: unitPrice, currency: pickStr(raw.currency) ?? 'USD' } : undefined,
    isActive: raw.archived ? !(pickBool(raw.archived) ?? false) : (pickBool(raw.active) ?? true),
    parentProductId: raw.parent_product_id != null ? String(raw.parent_product_id) : undefined,
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'skunexus',
    metadata: strMap({
      product_type: raw.product_type,
      weight_unit: raw.weight_unit,
      dimension_unit: raw.dimension_unit,
      currency: raw.currency,
    }),
    raw,
  }
}
