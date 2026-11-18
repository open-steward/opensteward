/**
 * Transform a Booqable product_group JSON:API resource into the canonical Product schema.
 *
 * Booqable models inventory as product_groups (the template / SKU-group) containing
 * individual products (variants). We surface product_groups as Products because that
 * is the rentable unit customers and operators care about.
 *
 * Key Booqable v4 product_group attributes:
 *   name, sku, slug, description, base_price_in_cents, price_type, price_period,
 *   trackable, has_variations, archived, archived_at, stock_count, products_count,
 *   tax_category_id, created_at, updated_at
 *
 * Amounts: base_price_in_cents is already INTEGER MINOR UNITS — passed through as-is.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso, unwrapAttributes, type JsonApiResource} from './shared'

export interface RawBooqableProductGroup extends JsonApiResource {
  type: 'product_groups'
}

/** Flat attribute bag after unwrapping JSON:API envelope. */
interface ProductGroupAttrs {
  id: string
  name?: string
  sku?: string
  slug?: string
  description?: string
  base_price_in_cents?: number
  price_type?: string
  price_period?: string
  trackable?: boolean
  has_variations?: boolean
  archived?: boolean
  archived_at?: string
  stock_count?: number
  products_count?: number
  tax_category_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawBooqableProductGroup): Product {
  const attrs = unwrapAttributes(raw) as ProductGroupAttrs

  return {
    id: attrs.id,
    externalId: attrs.id,
    sku: pickStr(attrs.sku) ?? '',
    name: pickStr(attrs.name) ?? '',
    description: pickStr(attrs.description),
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    retailPrice: attrs.base_price_in_cents !== undefined
      ? { amount: attrs.base_price_in_cents, currency: 'USD' }
      : undefined,
    isActive: !(pickBool(attrs.archived) ?? false),
    supplierIds: [],
    createdAt: toIso(attrs.created_at),
    updatedAt: toIso(attrs.updated_at),
    platform: 'booqable',
    metadata: strMap({
      slug: attrs.slug,
      priceType: attrs.price_type,
      pricePeriod: attrs.price_period,
      trackable: attrs.trackable,
      hasVariations: attrs.has_variations,
      stockCount: attrs.stock_count,
      productsCount: attrs.products_count,
    }),
    raw,
  }
}
