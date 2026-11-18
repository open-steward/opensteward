/**
 * Transform Qoblex GET /v1/products item into canonical Product.
 *
 * Qoblex models products as a parent record with one or more variants.
 * We surface the first (or only) variant's SKU/barcode/weight/price here;
 * multi-variant products appear as separate Product records via the variants
 * array flattening performed in QoblexAdapter.listProducts.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

/** Shape of one variant entry inside a Qoblex product response. */
export interface RawQoblexVariant {
  id?: number
  name?: string
  sku?: string
  barcode?: string
  weight?: number
  weight_unit?: string
  retail_price?: number
  quantity?: number
  allocated_quantity?: number
  incoming_quantity?: number
  last_updated_time?: string
  stock_changed_at?: string
  supplier_ids?: number[]
  brand?: string
  product_type?: string
  [key: string]: unknown
}

/** Shape of one product object from GET /v1/products response. */
export interface RawQoblexProduct {
  id: number
  name?: string
  description?: string
  updated_at?: string
  is_archived?: boolean
  product_type?: string
  brand?: string
  tags?: string
  /** Primary supplier (lightweight) */
  supplier?: { supplier_id?: number; name?: string }
  variants?: RawQoblexVariant[]
  [key: string]: unknown
}

/**
 * Convert a Qoblex product + one variant into a canonical Product.
 * Weight in Qoblex is in the `weight_unit` field (g/kg/lb/oz) — we normalise
 * to grams. Retail price is stored in major currency units (e.g. 9.99 USD).
 */
export function transformProduct(raw: RawQoblexProduct, variant?: RawQoblexVariant): Product {
  const v = variant ?? raw.variants?.[0] ?? {}
  const productId = String(raw.id)
  const variantId = v.id !== undefined ? String(v.id) : productId

  // Weight → grams
  let weightGrams: number | undefined
  if (v.weight !== undefined) {
    const unit = (v.weight_unit ?? 'g').toLowerCase()
    if (unit === 'kg') weightGrams = v.weight * 1000
    else if (unit === 'lb') weightGrams = v.weight * 453.592
    else if (unit === 'oz') weightGrams = v.weight * 28.3495
    else weightGrams = v.weight // assume grams
  }

  // Supplier IDs from variant.supplier_ids array + parent supplier
  const supplierIds: string[] = []
  if (raw.supplier?.supplier_id !== undefined) supplierIds.push(String(raw.supplier.supplier_id))
  for (const sid of v.supplier_ids ?? []) {
    const s = String(sid)
    if (!supplierIds.includes(s)) supplierIds.push(s)
  }

  return {
    id: variantId,
    externalId: variantId,
    sku: pickStr(v.sku) ?? '',
    name: pickStr(v.name) ?? pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(v.barcode),
    brand: pickStr(v.brand) ?? pickStr(raw.brand),
    category: pickStr(raw.product_type) ?? pickStr(v.product_type),
    unitOfMeasure: 'each',
    weightGrams,
    isActive: !(raw.is_archived ?? false),
    parentProductId: variant !== undefined ? productId : undefined,
    supplierIds,
    updatedAt: toIso(raw.updated_at) ?? toIso(v.last_updated_time),
    platform: 'qoblex',
    metadata: strMap({
      productId: raw.id,
      tags: raw.tags,
      variantId: v.id,
    }),
    raw: { product: raw, variant: v },
  }
}
