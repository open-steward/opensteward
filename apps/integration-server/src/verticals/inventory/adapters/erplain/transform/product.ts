import type { Product } from '../../../schema/product'
import { pickBool, pickStr, requireId, strMap } from './shared'

/**
 * Erplain v2 `Product`, as selected by PRODUCT_FIELDS in ../index.ts.
 *
 * Every field comes from the "Available fields" table of
 * https://erplain.readme.io/v2.0/reference/products-queries:
 *   id                   Int      "Unique identifier."
 *   label                String   "Name of the product (Parent)."
 *   active               Boolean  "True if the product is active in the catalog."
 *   sku                  String   "Representative SKU (usually from the first variant)."
 *   type                 String   "Product category (Standard, Variant, Kit)."
 *   description          String   "Public description used in documents and portal."
 *   supplier_description String   "Specific description for purchase orders."
 *   country_of_origin    String   "Origin country for customs."
 *   default_supplier_id  Int      "ID of the primary supplier."
 *   brand                Brand    "Manufacturer or brand link." (selected as `brand { label }`)
 *   created_at           DateTime "Creation timestamp."
 *   updated_at           DateTime "Last update timestamp."
 *
 * DateTime is documented as "Date and time (format : YYYY-MM-DD HH:MM:SS)"
 * (https://erplain.readme.io/v2.0/reference/data-types) with no zone, so the
 * instant cannot be known: the raw strings go to metadata, and createdAt /
 * updatedAt stay absent rather than guessed.
 */
export interface RawErplainProduct {
  id: number | string
  label?: string | null
  active?: boolean | number | null
  sku?: string | null
  type?: string | null
  description?: string | null
  supplier_description?: string | null
  country_of_origin?: string | null
  default_supplier_id?: number | string | null
  brand?: { label?: string | null } | null
  created_at?: string | null
  updated_at?: string | null
}

export function transformProduct(raw: RawErplainProduct): Product {
  const id = requireId(raw.id, 'product')
  const active = pickBool(raw.active)
  if (active === undefined) throw new Error(`erplain product ${id} has no active flag`)
  const supplierId = pickStr(raw.default_supplier_id)
  return {
    id,
    externalId: id,
    // `sku` is nullable upstream ("Representative SKU"); a product without one
    // has no SKU, which the required canonical string records as empty.
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.label) ?? '',
    description: pickStr(raw.description),
    brand: pickStr(raw.brand?.label),
    isActive: active,
    supplierIds: supplierId ? [supplierId] : [],
    platform: 'erplain',
    metadata: strMap({
      type: raw.type,
      country_of_origin: raw.country_of_origin,
      supplier_description: raw.supplier_description,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }),
    raw,
  }
}
