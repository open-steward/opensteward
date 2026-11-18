/**
 * Zid Product / Variant → canonical Product / ProductVariant.
 *
 * Zid's /v1/products/ endpoint returns products in a flat structure with
 * nested `variants` (when `extended=true`) and `options`. Product names and
 * descriptions are localised objects `{ ar, en }` — we prefer the English value.
 *
 * Prices are decimal major-unit numbers in the store currency (typically SAR).
 * We convert to integer minor units via `majorToMinor`.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Zid shapes ───────────────────────────────────────────────────────────

export interface RawZidLocalised {
  ar?: string | null
  en?: string | null
}

export interface RawZidImage {
  thumbnail?: string
  small?: string
  medium?: string
  large?: string
  original?: string
  url?: string
}

export interface RawZidVariantAttribute {
  name?: string | RawZidLocalised
  value?: string | RawZidLocalised
}

export interface RawZidVariant {
  id?: number | string
  sku?: string
  barcode?: string | null
  price?: number | string
  sale_price?: number | string | null
  quantity?: number | null
  is_infinite?: boolean
  attributes?: RawZidVariantAttribute[]
  [key: string]: unknown
}

export interface RawZidProductOption {
  name?: string | RawZidLocalised
  values?: Array<string | RawZidLocalised>
}

export interface RawZidProduct {
  id?: number | string
  sku?: string
  barcode?: string | null
  slug?: string
  name?: string | RawZidLocalised
  short_description?: string | RawZidLocalised
  description?: string | RawZidLocalised
  price?: number | string
  sale_price?: number | string | null
  currency?: string
  quantity?: number | null
  is_infinite?: boolean
  is_draft?: boolean
  is_published?: boolean
  is_taxable?: boolean
  requires_shipping?: boolean
  images?: RawZidImage[]
  options?: RawZidProductOption[]
  variants?: RawZidVariant[]
  product_class?: string | null
  structure?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Prefer English value from a localised string object; fall back to Arabic. */
function localised(v: string | RawZidLocalised | null | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v || undefined
  return (v.en || v.ar) ?? undefined
}

function toNum(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

function bestImageUrl(img: RawZidImage): string | undefined {
  return img.large ?? img.original ?? img.medium ?? img.small ?? img.thumbnail ?? img.url
}

function mapImages(images: RawZidImage[] | undefined): Image[] | undefined {
  if (!images || images.length === 0) return undefined
  const out: Image[] = []
  for (const img of images) {
    const url = bestImageUrl(img)
    if (url) out.push({ url })
  }
  return out.length > 0 ? out : undefined
}

function mapStatus(product: RawZidProduct): ProductStatus | undefined {
  if (product.is_draft === true) return 'DRAFT'
  if (product.is_published === false) return 'ARCHIVED'
  if (product.is_published === true) return 'ACTIVE'
  return undefined
}

function mapOptions(opts: RawZidProductOption[] | undefined): ProductOption[] | undefined {
  if (!opts || opts.length === 0) return undefined
  return opts.map((o, i) => ({
    name: localised(o.name) ?? `Option ${i + 1}`,
    values: (o.values ?? []).map((v) => localised(v) ?? String(v)),
  }))
}

export function transformVariant(
  raw: RawZidVariant,
  currency: string = 'SAR',
  productId?: string,
): ProductVariant {
  const price = toNum(raw.price)
  const salePrice = toNum(raw.sale_price)
  const optionValues: Record<string, string> = {}
  for (const attr of raw.attributes ?? []) {
    const name = localised(attr.name)
    const value = localised(attr.value)
    if (name && value) optionValues[name] = value
  }
  return {
    id: String(raw.id ?? ''),
    productId,
    sku: raw.sku || undefined,
    barcode: raw.barcode ?? undefined,
    price: {
      amount: price != null ? majorToMinor(price, currency) : 0,
      currency,
    },
    compareAtPrice:
      salePrice != null && salePrice > 0
        ? { amount: majorToMinor(salePrice, currency), currency }
        : undefined,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawZidProduct): Product {
  const currency = (raw.currency as string | undefined) ?? 'SAR'
  const price = toNum(raw.price)
  const productId = raw.id != null ? String(raw.id) : ''

  const variants =
    raw.variants && raw.variants.length > 0
      ? raw.variants.map((v) => transformVariant(v, currency, productId))
      : undefined

  return {
    id: productId,
    title: localised(raw.name) ?? '',
    description: localised(raw.description) ?? localised(raw.short_description),
    handle: raw.slug,
    status: mapStatus(raw),
    productType: raw.product_class ?? undefined,
    tags: undefined,
    options: mapOptions(raw.options),
    variants,
    images: mapImages(raw.images),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    // Zid does not have a separate publishedAt timestamp; use created_at when published.
    publishedAt: raw.is_published ? raw.created_at : undefined,
    metadata: {
      ...raw,
      // Expose money in minor units for quick access without re-parsing.
      _price_minor: price != null ? majorToMinor(price, currency) : undefined,
      _currency: currency,
    } as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Zid product create/update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body.name = product.title
  if (product.description) body.description = { en: product.description, ar: product.description }
  if (product.handle) body.slug = product.handle
  if (product.status === 'DRAFT') {
    body.is_draft = true
    body.is_published = false
  } else if (product.status === 'ACTIVE') {
    body.is_draft = false
    body.is_published = true
  } else if (product.status === 'ARCHIVED') {
    body.is_published = false
  }
  return body
}
