/**
 * Transform a Vend POS (Lightspeed Retail X-Series) product API v2.0 object
 * into the OpenSteward canonical Product schema.
 *
 * API reference: GET /api/2.0/products
 * Key fields from the Vend data model:
 *   id, handle, sku, name (base_name), description, supplier_code, supplier_id,
 *   supply_price, price (retail_price_ex_tax), price_including_tax, brand_id,
 *   type (product type name), has_variants, is_active, variant_parent_id,
 *   created_at, updated_at
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

// Vend prices are stored without a currency on the product record; currency
// lives at the outlet level (outlet.currency).  We therefore omit retailPrice
// rather than hardcode a currency code.

export interface RawVendProduct {
  /** UUID */
  id: string
  /** Human-readable URL slug */
  handle?: string
  /** SKU — may be on variant, absent on base */
  sku?: string
  /** Display name (may include variant suffix) */
  name?: string
  /** Family / base name */
  base_name?: string
  description?: string
  /** Barcode / UPC */
  source_id?: string
  /** Supplier internal code */
  supplier_code?: string
  /** UUID of primary supplier */
  supplier_id?: string
  /** Retail price excluding tax (decimal) */
  price?: number | string
  /** Retail price including tax (decimal) */
  price_including_tax?: number | string
  /** Supply / cost price (decimal) */
  supply_price?: number | string
  /** UUID of brand */
  brand_id?: string
  /** UUID of product type */
  product_type_id?: string
  /** Human-readable type string (from side-load or embedded) */
  type?: string
  /** true when product has variants */
  has_variants?: boolean
  /** UUID of parent variant group */
  variant_parent_id?: string
  /** false → deleted / de-listed */
  is_active?: boolean | string
  /** ISO 8601 */
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

export function transformProduct(raw: RawVendProduct): Product {
  const supplierIds: string[] = []
  if (raw.supplier_id) supplierIds.push(raw.supplier_id)

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.base_name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.source_id),
    brand: pickStr(raw.brand_id),
    category: pickStr(raw.type),
    unitOfMeasure: 'each',
    // retailPrice intentionally omitted: currency is per-outlet in Vend and is
    // not present on the product record.  Callers that have outlet context may
    // enrich this field after resolving the outlet currency.
    isActive: raw.deleted_at ? false : (pickBool(raw.is_active) ?? true),
    parentProductId: pickStr(raw.variant_parent_id),
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'vend-pos',
    metadata: strMap({
      handle: raw.handle,
      supplierCode: raw.supplier_code,
      hasVariants: raw.has_variants,
      productTypeId: raw.product_type_id,
      supplyPrice: raw.supply_price,
      retailPriceDecimal: raw.price,
    }),
    raw,
  }
}
