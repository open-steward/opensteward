/**
 * Wish Product / Variation → canonical Product / ProductVariant.
 *
 * Wish API v2 product response shape:
 *   GET /api/v2/product       → { code: 0, data: { Product: { ... } } }
 *   GET /api/v2/product/multi-get → { code: 0, data: { results: [{ Product: {...} }], ... } }
 *
 * Products have an outer `Product` key inside `data`; variants come from
 * `product/variant/multi-get` and are wrapped in `{ Variant: { ... } }` items.
 *
 * Money fields on Wish products are decimal major-unit USD values (e.g. 9.99).
 * The currency is always USD on the Wish marketplace.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Wish API shapes ──────────────────────────────────────────────────────

/** Raw Wish product object as returned inside the `Product` envelope key. */
export interface RawWishProduct {
  id: string
  name?: string
  description?: string
  /** Primary SKU (maps to handle / slug). */
  sku?: string
  /** Comma-separated tag string. */
  tags?: string
  /** Main product image URL. */
  main_image?: string
  /** Additional image URLs. */
  extra_images?: string[]
  enabled?: boolean
  /** Unix epoch integer or ISO-8601 datetime string. */
  create_time?: string | number
  /** Unix epoch integer or ISO-8601 datetime string. */
  last_updated?: string | number
  is_promoted?: boolean
  [key: string]: unknown
}

/** Raw Wish variant (variation) as returned inside the `Variant` envelope key. */
export interface RawWishVariant {
  id?: string
  /** Parent product id. */
  product_id?: string
  sku?: string
  /** Retail price in USD major units (e.g. 9.99). */
  price?: number | string
  /** Shipping price in USD major units. */
  shipping?: number | string
  /** Available inventory count. */
  inventory?: number
  color?: string
  size?: string
  /** Whether the variant is active/enabled. */
  enabled?: boolean
  /** Main image URL for this variant. */
  main_image?: string
  /** Unix epoch integer or ISO-8601 datetime string. */
  create_time?: string | number
  /** Unix epoch integer or ISO-8601 datetime string. */
  last_updated?: string | number
  [key: string]: unknown
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Wish marketplace currency is always USD. */
const WISH_CURRENCY = 'USD'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinorUsd(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(n, WISH_CURRENCY)
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function mapStatus(enabled: boolean | undefined): ProductStatus | undefined {
  if (enabled === undefined) return undefined
  return enabled ? 'ACTIVE' : 'DRAFT'
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawWishProduct): Product {
  const images = []
  if (raw.main_image) {
    images.push({ url: raw.main_image })
  }
  if (Array.isArray(raw.extra_images)) {
    for (const url of raw.extra_images) {
      if (typeof url === 'string' && url) images.push({ url })
    }
  }

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    handle: raw.sku ?? undefined,
    status: mapStatus(raw.enabled),
    tags: splitTags(raw.tags),
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.create_time),
    updatedAt: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Wish product/add body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    description: product.description,
    tags: product.tags?.join(', '),
    main_image: product.images?.[0]?.url,
    extra_images: product.images?.slice(1).map((i) => i.url),
    enabled: product.status ? product.status === 'ACTIVE' : undefined,
  }
}

export function transformVariant(raw: RawWishVariant): ProductVariant {
  const optionValues: Record<string, string> = {}
  if (raw.color) optionValues['Color'] = raw.color
  if (raw.size) optionValues['Size'] = raw.size

  return {
    id: raw.id ? String(raw.id) : (raw.sku ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    sku: raw.sku ?? undefined,
    title: [raw.color, raw.size].filter(Boolean).join(' / ') || undefined,
    price: { amount: toMinorUsd(raw.price), currency: WISH_CURRENCY },
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: { ...raw, main_image: raw.main_image } as unknown as Record<string, unknown>,
  }
}

/** Canonical ProductVariant → Wish variant/add or variant/update body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  // Wish price fields are major-unit USD decimals.
  const priceDecimal =
    variant.price?.amount != null ? (variant.price.amount / 100).toFixed(2) : undefined
  return {
    sku: variant.sku,
    price: priceDecimal,
    color: variant.optionValues?.['Color'],
    size: variant.optionValues?.['Size'],
    enabled: undefined,
  }
}

// ── API v3 (reads) ───────────────────────────────────────────────────────────
//
// Shapes from the first-party v3 OpenAPI behind
// https://merchant.wish.com/documentation/api/v3/reference:
//   GET /api/v3/products      → data: ListShallowProductsResponse, "The list
//                               of products without nested data."
//   GET /api/v3/products/{id} → data: Product (ShallowProduct fields plus
//                               main_image, extra_images and variations).
// The write methods above still use the v2 shapes.

/** v3 `Price`: required ["amount", "currency_code"]; amount "Non-negative amount in decimals." */
export interface RawWishV3Price {
  amount: number
  currency_code: string
}

/** v3 `Image`. */
export interface RawWishV3Image {
  /** "The URL of the image of the product." */
  url?: string
}

/** v3 `ProductVariation`. */
export interface RawWishV3Variation {
  /** "The ID of the variation." */
  id?: string
  /** "The ID of the product." */
  product_id?: string
  /** "The Stock Keeping Unit of the variation." */
  sku?: string
  /** "The Global Trade Item Number of the product." */
  gtin?: string
  /** "The price of the variation." */
  price?: RawWishV3Price
  /** "Parameters used to define the variations." Option required ["name", "value"]. */
  options?: Array<{ name: string; value: string }>
  /** "The inventory of the variation in each warehouse." */
  inventories?: Array<{ inventory: number; warehouse_id: string }>
  logistics_details?: {
    /** "(units in grams)" */
    weight?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** v3 `ShallowProduct`, and the `Product` detail that extends it. */
export interface RawWishV3Product {
  /** "The ID of the product." */
  id?: string
  /** "The name of the product." */
  name?: string
  /** "The description of the product." */
  description?: string
  /** "The list of tags of the product." */
  tags?: string[]
  state?:
    'ACTIVE' | 'WISH_INACTIVE' | 'MERCHANT_INACTIVE' | 'REMOVED_BY_WISH' | 'REMOVED_BY_MERCHANT'
  /** "The time when product was created." */
  created_at?: string
  /** "The time when product was last updated." */
  updated_at?: string
  /** Detail only: "The main image of the product." */
  main_image?: RawWishV3Image
  /** Detail only: "The extra images of the product in addition to the main image." */
  extra_images?: RawWishV3Image[]
  /** Detail only: "The variations of the product." */
  variations?: RawWishV3Variation[]
  [key: string]: unknown
}

/**
 * v3 `state` → canonical status. The documented states:
 * "ACTIVE - state reflects listings that are live", "WISH_INACTIVE - …
 * listings that are being processed and not live yet", "MERCHANT_INACTIVE -
 * are listings disabled by the merchant", "REMOVED_BY_WISH - are listings
 * removed by Wish", "REMOVED_BY_MERCHANT - are listings that are removed by
 * the merchant".
 */
function mapV3State(state: RawWishV3Product['state']): ProductStatus | undefined {
  switch (state) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'WISH_INACTIVE':
    case 'MERCHANT_INACTIVE':
      return 'DRAFT'
    case 'REMOVED_BY_WISH':
    case 'REMOVED_BY_MERCHANT':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function v3Money(price: RawWishV3Price): { amount: number; currency: string } {
  return { amount: majorToMinor(price.amount, price.currency_code), currency: price.currency_code }
}

export function transformV3Variation(raw: RawWishV3Variation): ProductVariant {
  if (!raw.id) throw new Error('Wish variation has no id')
  if (!raw.price) throw new Error(`Wish variation ${raw.id} has no price`)
  const optionValues: Record<string, string> = {}
  for (const o of raw.options ?? []) optionValues[o.name] = o.value
  const weight = raw.logistics_details?.weight
  return {
    id: raw.id,
    productId: raw.product_id,
    sku: raw.sku,
    barcode: raw.gtin,
    price: v3Money(raw.price),
    weight,
    weightUnit: weight === undefined ? undefined : 'g',
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformV3Product(raw: RawWishV3Product): Product {
  if (!raw.id) throw new Error('Wish product has no id')
  if (raw.name === undefined) throw new Error(`Wish product ${raw.id} has no name`)
  const images: Array<{ url: string }> = []
  if (raw.main_image?.url) images.push({ url: raw.main_image.url })
  for (const img of raw.extra_images ?? []) if (img.url) images.push({ url: img.url })
  return {
    id: raw.id,
    title: raw.name,
    description: raw.description,
    status: mapV3State(raw.state),
    tags: raw.tags,
    images: images.length > 0 ? images : undefined,
    // `price` is optional on ProductVariation and required on the canonical
    // variant, so a variation without one is left out here (it stays in
    // `metadata`) rather than failing the whole product.
    variants: raw.variations?.filter((v) => v.price).map(transformV3Variation),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
