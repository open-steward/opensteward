import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso, m2oId, m2oName} from './shared'

/**
 * Fulfil product.product record.
 *
 * Many2One fields (template, category, uom, etc.) are returned as [id, rec_name] tuples.
 * Fields are requested explicitly — only mapped fields are guaranteed present.
 */
export interface RawFulfilProduct {
  /** Integer record id */
  id: number
  /** Product code / SKU */
  code?: string
  /** Variant display name (rec_name) */
  rec_name?: string
  /** Template-level name */
  template?: [number, string] | null
  /** Product description */
  description?: string | null
  /** UPC / barcode */
  barcode?: string | null
  /** Brand (Many2One) */
  brand?: [number, string] | null
  /** Category (Many2One) */
  category?: [number, string] | null
  /** Unit of measure (Many2One) */
  default_uom?: [number, string] | null
  /** Gross weight in kg */
  weight?: number | null
  /** Weight unit (Many2One) */
  weight_uom?: [number, string] | null
  /** List price (decimal) */
  list_price?: number | null
  /** Cost price (decimal) */
  cost_price?: number | null
  /** Currency code (Many2One) */
  currency?: [number, string] | null
  /** Whether product is active */
  active?: boolean
  /** Template product id (parent) */
  template_id?: number | null
  /** Default supplier (Many2One) */
  purchase_party?: [number, string] | null
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for this model. */
export const PRODUCT_FIELDS = [
  'id', 'code', 'rec_name', 'template', 'description', 'barcode', 'brand',
  'category', 'default_uom', 'weight', 'weight_uom', 'list_price', 'cost_price',
  'currency', 'active', 'purchase_party', 'create_date', 'write_date',
]

export function transformProduct(raw: RawFulfilProduct): Product {
  const id = String(raw.id)

  // Fulfil list_price is a decimal in the account currency; store as-is (no minor-unit conversion
  // because the currency denomination is unknown without the currency record).
  const listPrice = pickNum(raw.list_price)
  const currencyCode = m2oName(raw.currency) ?? 'USD'

  return {
    id,
    externalId: id,
    sku: pickStr(raw.code) ?? '',
    name: pickStr(raw.rec_name) ?? m2oName(raw.template) ?? '',
    description: pickStr(raw.description ?? undefined),
    upc: pickStr(raw.barcode ?? undefined),
    brand: m2oName(raw.brand) ?? undefined,
    category: m2oName(raw.category) ?? undefined,
    unitOfMeasure: m2oName(raw.default_uom) ?? 'each',
    // weight in kg -> grams
    weightGrams: raw.weight != null ? raw.weight * 1000 : undefined,
    retailPrice: listPrice != null ? { amount: listPrice, currency: currencyCode } : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds: raw.purchase_party ? [m2oId(raw.purchase_party) ?? ''] : [],
    createdAt: toIso(raw.create_date),
    updatedAt: toIso(raw.write_date),
    platform: 'fulfil-io',
    metadata: strMap({
      uomId: m2oId(raw.default_uom),
      brandId: m2oId(raw.brand),
      categoryId: m2oId(raw.category),
      templateId: m2oId(raw.template),
    }),
    raw,
  }
}
