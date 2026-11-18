/**
 * Lightspeed Retail (X-Series) product transform.
 *
 * API endpoint: GET /api/2.0/products
 * Docs: https://x-series-api.lightspeedhq.com/reference/listproducts
 *
 * Key X-Series fields:
 *   id           — UUID
 *   handle       — URL-friendly slug (shared across variants of a family)
 *   name         — full display name (includes variant info)
 *   base_name    — family/parent product name
 *   sku          — stock keeping unit
 *   active       — boolean
 *   description  — plain text
 *   supply_price — decimal supplier cost price
 *   source / source_id / source_variant_id — external sync metadata
 *   supplier_id  — ID of the default supplier
 *   brand_id     — ID of the brand resource
 *   tags         — array of tag strings
 *   categories   — array of category objects { id, name }
 *   taxes        — array of tax objects { id, name, rate }
 *   version      — monotonic cursor value
 *   created_at / updated_at — ISO datetime strings
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawLightspeedProduct {
  id: string
  handle?: string
  name?: string
  base_name?: string
  sku?: string
  active?: boolean | string
  description?: string
  supply_price?: number | string
  price?: number | string
  price_excluding_tax?: number | string
  price_including_tax?: number | string
  supplier_id?: string
  brand_id?: string
  brand_name?: string
  tags?: string[]
  categories?: Array<{ id: string; name?: string }>
  tax_id?: string
  source?: string
  source_id?: string
  source_variant_id?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  version?: number
  [key: string]: unknown
}

export function transformProduct(raw: RawLightspeedProduct): Product {
  const supplierIds: string[] = []
  if (raw.supplier_id) supplierIds.push(raw.supplier_id)

  const categoryNames = (raw.categories ?? [])
    .map((c) => c.name ?? '')
    .filter(Boolean)

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.base_name) ?? '',
    description: pickStr(raw.description),
    upc: undefined, // X-Series does not expose barcode at the product level in v2
    brand: pickStr(raw.brand_name),
    category: categoryNames[0],
    unitOfMeasure: 'each',
    // X-Series does not expose currency at the product level; it is stored on
    // the outlet (location) object. Omit retailPrice rather than fabricate a
    // currency code — callers that need a money value should join with the
    // outlet's `currency` field.
    retailPrice: undefined,
    isActive: pickBool(raw.active) ?? !raw.deleted_at,
    parentProductId: undefined, // handle is the family slug, not a parent ID
    supplierIds,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'lightspeed-inventory',
    metadata: strMap({
      handle: raw.handle,
      baseName: raw.base_name,
      brandId: raw.brand_id,
      taxId: raw.tax_id,
      source: raw.source,
      sourceId: raw.source_id,
      sourceVariantId: raw.source_variant_id,
      tags: (raw.tags ?? []).join(','),
      categories: categoryNames.join(','),
    }),
    raw,
  }
}
