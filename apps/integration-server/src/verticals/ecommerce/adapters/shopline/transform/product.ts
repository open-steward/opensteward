/**
 * SHOPLINE Product / Variant / Image → canonical.
 *
 * SHOPLINE returns products with nested variants, images, and options. The
 * shape is very similar to Shopify's but uses `featured_media` / `media[]`
 * for images (the legacy `images[]` array is deprecated from v20260301). We
 * support both for backward-compatibility.
 *
 * SHOPLINE variant options are positional (option1–option5) like Shopify, but
 * support up to 5 option axes.
 *
 * Docs:
 *   https://developer.shopline.com/docs/admin-rest-api/product/product/get-products/
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw SHOPLINE shapes ───────────────────────────────────────────────────────

export interface RawShoplineMedia {
  id?: number | string
  src?: string
  alt?: string | null
  content_type?: string // 'IMAGE' | 'VIDEO' | ...
  preview_image?: { src?: string }
  position?: number
  width?: number
  height?: number
}

export interface RawShoplineOptionValue {
  id?: number | string
  name?: string
  value?: string
}

export interface RawShoplineOption {
  id?: number | string
  name: string
  position?: number
  values?: string[]
  option_values?: RawShoplineOptionValue[]
}

export interface RawShoplineVariant {
  id: number | string
  product_id?: number | string
  title?: string
  price?: string | number
  compare_at_price?: string | number | null
  sku?: string | null
  barcode?: string | null
  position?: number
  inventory_item_id?: number | string
  inventory_quantity?: number
  weight?: number
  weight_unit?: string
  taxable?: boolean
  requires_shipping?: boolean
  option1?: string | null
  option2?: string | null
  option3?: string | null
  option4?: string | null
  option5?: string | null
  image?: RawShoplineMedia | null
  [key: string]: unknown
}

export interface RawShoplineProduct {
  id: number | string
  title: string
  body_html?: string | null
  handle?: string
  status?: string
  vendor?: string
  product_type?: string
  spu?: string
  tags?: string | string[]
  options?: RawShoplineOption[]
  variants?: RawShoplineVariant[]
  // v20260301+ media fields
  featured_media?: RawShoplineMedia | null
  media?: RawShoplineMedia[]
  // legacy (deprecated v20260301) — keep for older API versions
  images?: Array<{ id?: number | string; src?: string; alt?: string | null; width?: number; height?: number; position?: number }>
  created_at?: string
  updated_at?: string
  published_at?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? majorToMinor(n, currency) : 0
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const up = s.toUpperCase()
  if (up === 'ACTIVE' || up === 'ARCHIVED' || up === 'DRAFT') return up
  return undefined
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function splitTags(tags: string | string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.filter((t) => t.length > 0)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function mapMedia(raw: RawShoplineMedia): Image | undefined {
  const url = raw.src ?? raw.preview_image?.src
  if (!url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

function transformOption(raw: RawShoplineOption): ProductOption {
  // Values may live in `values` (string array) or `option_values` (object array)
  const values: string[] =
    raw.values ??
    raw.option_values?.map((ov) => ov.value ?? ov.name ?? '').filter(Boolean) ??
    []
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name,
    values,
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variant by reading the
 * parent product's option names and matching against SHOPLINE's positional
 * option1–option5 fields.
 */
function buildOptionValues(
  variant: RawShoplineVariant,
  options: RawShoplineOption[] | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const out: Record<string, string> = {}
  const positional = [
    variant.option1,
    variant.option2,
    variant.option3,
    variant.option4,
    variant.option5,
  ]
  for (let i = 0; i < options.length; i++) {
    const val = positional[i]
    if (val != null) out[options[i]!.name] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawShoplineVariant,
  currency: string = 'USD',
  options?: RawShoplineOption[],
): ProductVariant {
  const compareAt = raw.compare_at_price
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.title,
    price: { amount: toMoneyAmount(raw.price, currency), currency },
    compareAtPrice:
      compareAt != null && compareAt !== ''
        ? { amount: toMoneyAmount(compareAt, currency), currency }
        : undefined,
    weight: raw.weight,
    weightUnit: mapWeightUnit(raw.weight_unit),
    inventoryItemId: raw.inventory_item_id != null ? String(raw.inventory_item_id) : undefined,
    optionValues: buildOptionValues(raw, options),
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawShoplineProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.options),
  )
  const options = (raw.options ?? []).map(transformOption)

  // Prefer modern `media[]`, fall back to legacy `images[]`
  let images: Image[] = []
  if (raw.media && raw.media.length > 0) {
    images = raw.media
      .filter((m) => !m.content_type || m.content_type === 'IMAGE')
      .map(mapMedia)
      .filter((i): i is Image => i != null)
  } else if (raw.images && raw.images.length > 0) {
    images = raw.images
      .filter((img): img is typeof img & { src: string } => Boolean(img.src))
      .map((img): Image => ({
        id: img.id != null ? String(img.id) : undefined,
        url: img.src,
        alt: img.alt ?? undefined,
        width: img.width,
        height: img.height,
        position: img.position,
      }))
  } else if (raw.featured_media) {
    const img = mapMedia(raw.featured_media)
    if (img) images = [img]
  }

  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.body_html ?? undefined,
    handle: raw.handle,
    status: mapStatus(raw.status),
    vendor: raw.vendor || undefined,
    productType: raw.product_type || raw.spu || undefined,
    tags: splitTags(raw.tags),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → SHOPLINE product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    body_html: product.description,
    handle: product.handle,
    vendor: product.vendor,
    product_type: product.productType,
    status: product.status ? product.status.toLowerCase() : undefined,
  }
  if (product.tags) body.tags = product.tags.join(',')
  if (product.options) {
    body.options = product.options.map((o) => ({
      name: o.name,
      values: o.values,
      position: o.position,
    }))
  }
  if (product.variants) {
    body.variants = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      title: v.title,
      price: v.price != null
        ? String(minorToMajor(v.price.amount, v.price.currency) ?? 0)
        : undefined,
      compare_at_price: v.compareAtPrice != null
        ? String(minorToMajor(v.compareAtPrice.amount, v.compareAtPrice.currency) ?? 0)
        : undefined,
      weight: v.weight,
      weight_unit: v.weightUnit,
      taxable: v.taxable,
      requires_shipping: v.requiresShipping,
      position: v.position,
    }))
  }
  if (product.images) {
    body.media = product.images.map((i) => ({
      src: i.url,
      alt: i.alt,
      content_type: 'IMAGE',
    }))
  }
  return body
}

/** Canonical ProductVariant → SHOPLINE variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    price: variant.price != null
      ? String(minorToMajor(variant.price.amount, variant.price.currency) ?? 0)
      : undefined,
    compare_at_price: variant.compareAtPrice != null
      ? String(minorToMajor(variant.compareAtPrice.amount, variant.compareAtPrice.currency) ?? 0)
      : undefined,
    weight: variant.weight,
    weight_unit: variant.weightUnit,
    taxable: variant.taxable,
    requires_shipping: variant.requiresShipping,
    position: variant.position,
  }
}
