/**
 * Sapo Product / Variant / Image → canonical.
 *
 * Sapo's product object differs from Shopify in several field names:
 *  - `name`        (Shopify: `title`)
 *  - `content`     (Shopify: `body_html`)
 *  - `alias`       (Shopify: `handle`)
 *  - `created_on`  (Shopify: `created_at`)
 *  - `modified_on` (Shopify: `updated_at`)
 *  - `published_on` (Shopify: `published_at`)
 *
 * Variants use the same `option1`/`option2`/`option3` positional fields.
 * Prices are decimal major-unit strings (e.g. "199.00") → convert to
 * integer minor units via `majorToMinor`.
 *
 * Docs: https://support.sapo.vn/phuong-thuc-get-cua-product
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

// ── Raw Sapo shapes ──────────────────────────────────────────────────────────

export interface RawSapoImage {
  id: number | string
  product_id?: number | string
  position?: number
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawSapoVariant {
  id: number | string
  product_id?: number | string
  title?: string
  price?: string | number
  compare_at_price?: string | number | null
  sku?: string
  barcode?: string | null
  position?: number
  weight?: number
  weight_unit?: string
  taxable?: boolean
  requires_shipping?: boolean
  inventory_quantity?: number
  option1?: string | null
  option2?: string | null
  option3?: string | null
  created_on?: string
  modified_on?: string
  [key: string]: unknown
}

export interface RawSapoOption {
  id?: number | string
  product_id?: number | string
  name: string
  position?: number
  values: string[]
}

export interface RawSapoProduct {
  id: number | string
  /** Product title — Sapo uses `name`, not `title`. */
  name: string
  /** HTML description — Sapo uses `content`, not `body_html`. */
  content?: string | null
  summary?: string | null
  /** URL slug — Sapo uses `alias`, not `handle`. */
  alias?: string
  vendor?: string
  product_type?: string
  tags?: string
  published_on?: string | null
  created_on?: string
  modified_on?: string
  options?: RawSapoOption[]
  variants?: RawSapoVariant[]
  images?: RawSapoImage[]
  image?: RawSapoImage | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(n, currency)
}

/** Sapo does not expose a product `status` field; derive from `published_on`. */
function deriveStatus(raw: RawSapoProduct): ProductStatus | undefined {
  if (raw.published_on != null) return 'ACTIVE'
  return undefined
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function transformImage(raw: RawSapoImage): Image {
  return {
    id: String(raw.id),
    url: raw.src ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

function transformOption(raw: RawSapoOption): ProductOption {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name,
    values: raw.values ?? [],
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variant by reading the
 * parent product's option names and matching them against Sapo's
 * `option1`/`option2`/`option3` positional fields.
 */
function buildOptionValues(
  variant: RawSapoVariant,
  options: RawSapoOption[] | undefined,
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
  raw: RawSapoVariant,
  currency: string = 'VND',
  options?: RawSapoOption[],
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
    optionValues: buildOptionValues(raw, options),
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawSapoProduct, currency: string = 'VND'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.options),
  )
  // Sapo exposes a top-level `image` (primary) plus an `images` array.
  const rawImages = raw.images ?? (raw.image ? [raw.image] : [])
  const images = rawImages.map(transformImage)
  const options = (raw.options ?? []).map(transformOption)

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.content ?? undefined,
    handle: raw.alias,
    status: deriveStatus(raw),
    vendor: raw.vendor || undefined,
    productType: raw.product_type || undefined,
    tags: splitTags(raw.tags),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_on,
    updatedAt: raw.modified_on,
    publishedAt: raw.published_on ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Sapo product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    content: product.description,
    alias: product.handle,
    vendor: product.vendor,
    product_type: product.productType,
  }
  if (product.tags) body.tags = product.tags.join(', ')
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
      price: v.price?.amount,
      compare_at_price: v.compareAtPrice?.amount,
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

/** Canonical ProductVariant → Sapo variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    price: variant.price?.amount,
    compare_at_price: variant.compareAtPrice?.amount,
    weight: variant.weight,
    weight_unit: variant.weightUnit,
    taxable: variant.taxable,
    requires_shipping: variant.requiresShipping,
    position: variant.position,
  }
}
