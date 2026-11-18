/**
 * SCAYLE Product / Variant / Image → canonical.
 *
 * SCAYLE models products with nested variants, images, and attributes. We
 * flatten them into the canonical shape where variants and images are
 * first-class arrays on the product.
 *
 * Key SCAYLE fields:
 *  - Product: id (int), referenceKey (SKU-like), name (localised map), state,
 *    attributes[], variants[], images[]
 *  - Variant: id (int), referenceKey (SKU), ean (barcode), attributes[],
 *    prices[] (each with price/oldPrice int minor units, currencyCode, countryCode),
 *    stocks[]
 *  - Image: id (int), url, attributes (position, type, etc.)
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleAttribute {
  name?: string
  values?: Array<{ value?: string | number | boolean | null }>
}

export interface RawScayleProductImage {
  id: number | string
  url?: string
  attributes?: Array<{
    name?: string
    values?: Array<{ value?: unknown }>
  }>
}

/** SCAYLE variant price — amounts are already in minor units (integer cents). */
export interface RawScayleVariantPrice {
  price?: number | null
  oldPrice?: number | null
  currencyCode?: string
  countryCode?: string
  key?: string
}

export interface RawScayleVariantStock {
  quantity?: number | null
  warehouseReferenceKey?: string
}

export interface RawScayleVariant {
  id: number | string
  referenceKey?: string
  ean?: string | null
  attributes?: RawScayleAttribute[]
  prices?: RawScayleVariantPrice[]
  stocks?: RawScayleVariantStock[]
  [key: string]: unknown
}

export interface RawScayleMaster {
  referenceKey?: string
}

export interface RawScayleProduct {
  id: number | string
  referenceKey?: string
  name?: Record<string, string> | string
  state?: string
  createdAt?: string
  updatedAt?: string
  master?: RawScayleMaster
  attributes?: RawScayleAttribute[]
  variants?: RawScayleVariant[]
  images?: RawScayleProductImage[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a locale-agnostic display string from SCAYLE's localised name map.
 * Prefers the `de` (German, SCAYLE's base locale) key, then any key found.
 */
function localeName(name: Record<string, string> | string | undefined): string {
  if (!name) return ''
  if (typeof name === 'string') return name
  return name['de'] ?? name['en'] ?? Object.values(name)[0] ?? ''
}

function mapState(state: string | undefined): ProductStatus | undefined {
  if (!state) return undefined
  const s = state.toLowerCase()
  if (s === 'live') return 'ACTIVE'
  if (s === 'draft' || s === 'new' || s === 'inapproval') return 'DRAFT'
  if (s === 'blocked' || s === 'problem') return 'ARCHIVED'
  return undefined
}

/**
 * Extract an attribute value from a SCAYLE attribute array by name.
 * Returns the first value as a string, or undefined.
 */
function attrValue(attrs: RawScayleAttribute[] | undefined, name: string): string | undefined {
  if (!attrs) return undefined
  const attr = attrs.find((a) => a.name === name)
  const val = attr?.values?.[0]?.value
  if (val == null) return undefined
  return String(val)
}

function transformImage(raw: RawScayleProductImage, position?: number): Image {
  return {
    id: String(raw.id),
    url: raw.url ?? '',
    position,
  }
}

export function transformVariant(raw: RawScayleVariant, productId?: string): ProductVariant {
  // Pick the first price available for currency/amount.
  const firstPrice = raw.prices?.[0]
  const currency = firstPrice?.currencyCode ?? 'EUR'
  // SCAYLE prices are already in minor units (integer).
  const priceAmount = firstPrice?.price ?? 0
  const oldPriceAmount = firstPrice?.oldPrice ?? undefined

  return {
    id: String(raw.id),
    productId,
    sku: raw.referenceKey || undefined,
    barcode: raw.ean ?? undefined,
    title: raw.referenceKey || undefined,
    price: { amount: priceAmount, currency },
    compareAtPrice:
      oldPriceAmount != null && oldPriceAmount > 0
        ? { amount: oldPriceAmount, currency }
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawScayleProduct): Product {
  const productId = String(raw.id)
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, productId))
  const images = (raw.images ?? []).map((img, idx) => transformImage(img, idx))

  // Description may be stored as an attribute.
  const description = attrValue(raw.attributes, 'description')

  return {
    id: productId,
    title: localeName(raw.name),
    description: description || undefined,
    handle: raw.referenceKey || undefined,
    status: mapState(raw.state),
    vendor: attrValue(raw.attributes, 'brand') || undefined,
    productType: attrValue(raw.attributes, 'category') || undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → SCAYLE product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    referenceKey: product.handle,
    state: product.status ? mapStatusOut(product.status) : undefined,
  }
  if (product.title) {
    body.name = { de: product.title, en: product.title }
  }
  return body
}

function mapStatusOut(status: ProductStatus): string {
  if (status === 'ACTIVE') return 'live'
  if (status === 'DRAFT') return 'draft'
  return 'blocked'
}
