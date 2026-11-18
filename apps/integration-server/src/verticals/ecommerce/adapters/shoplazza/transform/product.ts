/**
 * Shoplazza Product / Variant → canonical.
 *
 * Shoplazza returns products with nested variants, images, and options.
 * Key differences from Shopify:
 *  - Description field is `description` (Shoplazza) not `body_html`.
 *  - Product status is a boolean `published` (true = ACTIVE, false = DRAFT).
 *  - Variants use `price`, `compare_at_price`, `option1/2/3`, `weight`,
 *    `weight_unit`, `inventory_quantity` (no separate `inventory_item_id`).
 *  - Tags may be returned as a comma-separated string or an array.
 *
 * Docs: https://www.shoplazza.dev/reference/api-usage
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

// ── Raw Shoplazza shapes ─────────────────────────────────────────────────────

export interface RawShoplazzaImage {
  id?: number | string
  src?: string
  alt?: string | null
  position?: number
  width?: number
  height?: number
}

export interface RawShoplazzaOption {
  id?: number | string
  product_id?: number | string
  name: string
  position?: number
  values?: string[]
}

export interface RawShoplazzaVariant {
  id: number | string
  product_id?: number | string
  title?: string
  sku?: string | null
  barcode?: string | null
  price?: string | number | null
  compare_at_price?: string | number | null
  position?: number
  weight?: number | null
  weight_unit?: string | null
  inventory_quantity?: number | null
  taxable?: boolean
  requires_shipping?: boolean
  option1?: string | null
  option2?: string | null
  option3?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawShoplazzaProduct {
  id: number | string
  title: string
  /** HTML description — Shoplazza field name `description`. */
  description?: string | null
  /** Short plain-text brief (alternative description field). */
  brief?: string | null
  handle?: string | null
  /** true = published/active, false = draft. */
  published?: boolean | null
  published_at?: string | null
  vendor?: string | null
  /** Comma-separated string or array of tags. */
  tags?: string | string[] | null
  options?: RawShoplazzaOption[]
  variants?: RawShoplazzaVariant[]
  images?: RawShoplazzaImage[]
  /** Primary image — may duplicate the first entry of `images`. */
  image?: RawShoplazzaImage | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, currency)
}

function mapStatus(raw: RawShoplazzaProduct): ProductStatus | undefined {
  if (raw.published === true) return 'ACTIVE'
  if (raw.published === false) return 'DRAFT'
  return undefined
}

function mapWeightUnit(u: string | null | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function parseTags(tags: string | string[] | null | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) {
    const filtered = tags.filter((t) => t.trim().length > 0)
    return filtered.length > 0 ? filtered : undefined
  }
  const parts = (tags as string)
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  return parts.length > 0 ? parts : undefined
}

function transformImage(raw: RawShoplazzaImage): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.src ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

function transformOption(raw: RawShoplazzaOption): ProductOption {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name,
    values: raw.values ?? [],
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variant by reading the
 * parent product's option names and matching them against Shoplazza's
 * `option1`/`option2`/`option3` positional fields.
 */
function buildOptionValues(
  variant: RawShoplazzaVariant,
  options: RawShoplazzaOption[] | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const out: Record<string, string> = {}
  const positional = [variant.option1, variant.option2, variant.option3]
  for (let i = 0; i < options.length; i++) {
    const val = positional[i]
    if (val != null) out[options[i]!.name] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawShoplazzaVariant,
  currency: string = 'USD',
  options?: RawShoplazzaOption[],
): ProductVariant {
  const compareAt = raw.compare_at_price
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.title,
    price: { amount: toMoney(raw.price, currency), currency },
    compareAtPrice:
      compareAt != null && compareAt !== '' && compareAt !== '0' && compareAt !== 0
        ? { amount: toMoney(compareAt, currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: mapWeightUnit(raw.weight_unit),
    optionValues: buildOptionValues(raw, options),
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawShoplazzaProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.options),
  )
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.options ?? []).map(transformOption)

  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.description ?? raw.brief ?? undefined,
    handle: raw.handle ?? undefined,
    status: mapStatus(raw),
    vendor: raw.vendor ?? undefined,
    tags: parseTags(raw.tags),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Shoplazza product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.description,
    handle: product.handle,
    vendor: product.vendor,
    published:
      product.status === 'ACTIVE'
        ? true
        : product.status === 'DRAFT' || product.status === 'ARCHIVED'
          ? false
          : undefined,
  }
  if (product.tags) {
    body.tags = product.tags.join(',')
  }
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
      price: minorToMajor(v.price?.amount, v.price?.currency)?.toFixed(2),
      compare_at_price: minorToMajor(v.compareAtPrice?.amount, v.compareAtPrice?.currency)?.toFixed(2),
      weight: v.weight,
      weight_unit: v.weightUnit,
      taxable: v.taxable,
      requires_shipping: v.requiresShipping,
      position: v.position,
    }))
  }
  if (product.images) {
    body.images = product.images.map((i) => ({
      id: i.id,
      src: i.url,
      alt: i.alt,
      position: i.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → Shoplazza variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    price: minorToMajor(variant.price?.amount, variant.price?.currency)?.toFixed(2),
    compare_at_price: minorToMajor(variant.compareAtPrice?.amount, variant.compareAtPrice?.currency)?.toFixed(2),
    weight: variant.weight,
    weight_unit: variant.weightUnit,
    taxable: variant.taxable,
    requires_shipping: variant.requiresShipping,
    position: variant.position,
  }
}
