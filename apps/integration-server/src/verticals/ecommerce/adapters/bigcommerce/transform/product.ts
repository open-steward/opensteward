/**
 * BigCommerce Product / Variant → canonical.
 *
 * BigCommerce returns products with nested `variants` and `images` arrays.
 * Prices are floats (not cents). Options use `option_values` on variants
 * rather than Shopify's `option1`/`option2`/`option3` positional fields.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw BigCommerce shapes (minimal) ────────────────────────────────────────

export interface RawBigCommerceImage {
  id: number | string
  product_id?: number | string
  sort_order?: number
  url_standard?: string
  url_thumbnail?: string
  description?: string
  is_thumbnail?: boolean
  image_url?: string
}

export interface RawBigCommerceOptionValue {
  id?: number | string
  option_id?: number | string
  label?: string
  option_display_name?: string
}

export interface RawBigCommerceVariant {
  id: number | string
  product_id?: number | string
  sku?: string
  upc?: string | null
  price?: number | null
  sale_price?: number | null
  retail_price?: number | null
  cost_price?: number | null
  weight?: number | null
  inventory_level?: number
  inventory_warning_level?: number
  purchasing_disabled?: boolean
  option_values?: RawBigCommerceOptionValue[]
  sort_order?: number
  [key: string]: unknown
}

export interface RawBigCommerceOption {
  id?: number | string
  product_id?: number | string
  display_name?: string
  name?: string
  sort_order?: number
  option_values?: Array<{ id?: number | string; label?: string; sort_order?: number }>
}

export interface RawBigCommerceProduct {
  id: number | string
  name: string
  description?: string | null
  sku?: string
  type?: string // 'physical' | 'digital'
  weight?: number
  price?: number
  cost_price?: number
  retail_price?: number
  sale_price?: number
  categories?: number[]
  brand_id?: number
  is_visible?: boolean
  availability?: string // 'available' | 'disabled' | 'preorder'
  custom_url?: { url?: string }
  variants?: RawBigCommerceVariant[]
  images?: RawBigCommerceImage[]
  options?: RawBigCommerceOption[]
  date_created?: string
  date_modified?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(raw: RawBigCommerceProduct): ProductStatus | undefined {
  if (raw.is_visible === false || raw.availability === 'disabled') return 'ARCHIVED'
  if (raw.availability === 'preorder') return 'DRAFT'
  if (raw.is_visible === true) return 'ACTIVE'
  return undefined
}

function mapWeightUnit(_u: string | undefined): WeightUnit | undefined {
  // BigCommerce uses store-level weight units; default to oz (US-centric).
  // Callers should override via store settings if needed.
  return undefined
}

function transformImage(raw: RawBigCommerceImage): Image {
  return {
    id: String(raw.id),
    url: raw.url_standard ?? raw.image_url ?? '',
    alt: raw.description ?? undefined,
    position: raw.sort_order,
  }
}

function transformOption(raw: RawBigCommerceOption): ProductOption {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.display_name ?? raw.name ?? '',
    values: (raw.option_values ?? []).map((v) => v.label ?? '').filter((l) => l.length > 0),
    position: raw.sort_order,
  }
}

function buildOptionValues(
  variant: RawBigCommerceVariant,
): Record<string, string> | undefined {
  if (!variant.option_values || variant.option_values.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const ov of variant.option_values) {
    const name = ov.option_display_name ?? ov.label ?? ''
    const value = ov.label ?? ''
    if (name && value) out[name] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawBigCommerceVariant,
  currency: string = 'USD',
): ProductVariant {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    barcode: raw.upc ?? undefined,
    title: raw.option_values?.map((ov) => ov.label).join(' / ') || undefined,
    price: { amount: majorToMinor(raw.price ?? 0, currency), currency },
    compareAtPrice:
      raw.retail_price != null && raw.retail_price > 0
        ? { amount: majorToMinor(raw.retail_price, currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: mapWeightUnit(undefined),
    optionValues: buildOptionValues(raw),
    taxable: undefined, // BigCommerce manages tax at product/tax-class level
    requiresShipping: undefined,
    position: raw.sort_order,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawBigCommerceProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency))
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.options ?? []).map(transformOption)
  const handle = raw.custom_url?.url?.replace(/^\/|\/$/g, '') || undefined

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    handle,
    status: mapStatus(raw),
    vendor: undefined, // BigCommerce uses brand_id, not a vendor string
    productType: raw.type || undefined,
    tags: undefined, // BigCommerce does not have tags on products
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.date_created,
    updatedAt: raw.date_modified,
    publishedAt: raw.is_visible ? raw.date_created : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → BigCommerce product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    type: product.productType ?? 'physical',
    is_visible: product.status ? product.status !== 'ARCHIVED' : undefined,
  }
  if (product.handle) {
    body.custom_url = { url: `/${product.handle}/` }
  }
  if (product.variants) {
    body.variants = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      upc: v.barcode,
      // Canonical price is integer minor units; BigCommerce expects a decimal major-unit value.
      price: v.price?.amount != null ? v.price.amount / 100 : undefined,
      retail_price: v.compareAtPrice?.amount != null ? v.compareAtPrice.amount / 100 : undefined,
      weight: v.weight,
      sort_order: v.position,
    }))
  }
  if (product.images) {
    body.images = product.images.map((i) => ({
      id: i.id,
      image_url: i.url,
      description: i.alt,
      sort_order: i.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → BigCommerce variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    upc: variant.barcode,
    // Canonical price is integer minor units; BigCommerce expects a decimal major-unit value.
    price: variant.price?.amount != null ? variant.price.amount / 100 : undefined,
    retail_price: variant.compareAtPrice?.amount != null ? variant.compareAtPrice.amount / 100 : undefined,
    weight: variant.weight,
    sort_order: variant.position,
  }
}
