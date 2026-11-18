/**
 * Tiendanube / Nuvemshop Product + Variant → canonical.
 *
 * Key differences from Shopify:
 *  - `name`, `description`, and `handle` are i18n objects (e.g. `{ en: "…" }`).
 *    We prefer the English key, fall back to any available locale.
 *  - Variant option values live in `values: [{ en: "Small" }]` — i18n objects.
 *  - `published` is a boolean (not a string status).
 *  - Weight is a string decimal (in kg by convention).
 *  - Images are a separate `images` array with `src` URLs.
 *  - Tiendanube does not expose `compare_at_price` at the product level;
 *    variants have `promotional_price` (a discounted selling price) but there
 *    is no separate "was price" field — we map `promotional_price` to
 *    `compareAtPrice` as the closest structural equivalent.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/product
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── i18n helpers ─────────────────────────────────────────────────────────────

type I18nString = Record<string, string | null | undefined>

/**
 * Resolve a Tiendanube i18n object to a plain string. Prefers 'en', then
 * falls back to the first non-null locale value.
 */
function i18n(obj: I18nString | string | null | undefined): string | undefined {
  if (obj == null) return undefined
  if (typeof obj === 'string') return obj || undefined
  const v = obj['en'] ?? obj['es'] ?? obj['pt'] ?? Object.values(obj).find((x) => x != null)
  return v ?? undefined
}

// ── Raw Tiendanube shapes ─────────────────────────────────────────────────────

export interface RawTiendanubeImage {
  id: number | string
  product_id?: number | string
  src?: string
  position?: number
  alt?: string[] | string | null
  width?: number
  height?: number
  [key: string]: unknown
}

export interface RawTiendanubeVariant {
  id: number | string
  product_id?: number | string
  price?: string | number
  promotional_price?: string | number | null
  stock_management?: boolean
  stock?: number | string | null
  sku?: string | null
  barcode?: string | null
  weight?: string | number | null
  width?: number | null
  height?: number | null
  depth?: number | null
  image_id?: number | string | null
  /** Array of i18n objects: `[{ en: "Small" }]` */
  values?: Array<I18nString>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawTiendanubeProduct {
  id: number | string
  name?: I18nString | string
  description?: I18nString | string | null
  handle?: I18nString | string | null
  brand?: string | null
  published?: boolean
  free_shipping?: boolean
  requires_shipping?: boolean
  tags?: string | null
  attributes?: Array<I18nString>
  variants?: RawTiendanubeVariant[]
  images?: RawTiendanubeImage[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

function toMoney(v: string | number | null | undefined, currency: string): number {
  const n = toNum(v) ?? 0
  return majorToMinor(n, currency)
}

function mapStatus(published: boolean | undefined): ProductStatus | undefined {
  if (published === true) return 'ACTIVE'
  if (published === false) return 'DRAFT'
  return undefined
}

function mapWeightUnit(_raw: RawTiendanubeVariant): WeightUnit {
  // Tiendanube stores weight in kg
  return 'kg'
}

function splitTags(tags: string | null | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function transformImage(raw: RawTiendanubeImage): Image {
  const altRaw = raw.alt
  let alt: string | undefined
  if (Array.isArray(altRaw)) {
    alt = altRaw.find((s) => typeof s === 'string' && s.length > 0) ?? undefined
  } else if (typeof altRaw === 'string' && altRaw.length > 0) {
    alt = altRaw
  }
  return {
    id: String(raw.id),
    url: raw.src ?? '',
    alt,
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variant from Tiendanube's
 * `values` array (i18n objects). We also derive option names from the parent
 * product's `attributes` array.
 */
function buildOptionValues(
  variant: RawTiendanubeVariant,
  attributes: Array<I18nString> | undefined,
): Record<string, string> | undefined {
  const values = variant.values
  if (!values || values.length === 0) return undefined
  const out: Record<string, string> = {}
  for (let i = 0; i < values.length; i++) {
    const optionName = attributes?.[i] ? i18n(attributes[i]!) ?? `Option ${i + 1}` : `Option ${i + 1}`
    const val = i18n(values[i]!)
    if (val) out[optionName] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawTiendanubeVariant,
  currency: string = 'USD',
  attributes?: Array<I18nString>,
): ProductVariant {
  const weight = toNum(raw.weight)
  const title = raw.values?.map((v) => i18n(v)).filter(Boolean).join(' / ') || undefined

  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    barcode: raw.barcode ?? undefined,
    title,
    price: { amount: toMoney(raw.price, currency), currency },
    // promotional_price is a discounted price (sale price); there is no
    // separate "original price" field — we do not set compareAtPrice.
    weight: weight ?? undefined,
    weightUnit: weight != null ? mapWeightUnit(raw) : undefined,
    optionValues: buildOptionValues(raw, attributes),
    requiresShipping: true, // default; variants can override via free_shipping on product
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawTiendanubeProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.attributes),
  )
  const images = (raw.images ?? []).map(transformImage)

  // Build options from product attributes + variant values
  const options = (raw.attributes ?? []).map((attr, i) => ({
    name: i18n(attr) ?? `Option ${i + 1}`,
    values: [
      ...new Set(
        (raw.variants ?? [])
          .map((v) => (v.values?.[i] ? i18n(v.values[i]!) : undefined))
          .filter((x): x is string => !!x),
      ),
    ],
    position: i,
  }))

  return {
    id: String(raw.id),
    title: i18n(raw.name as I18nString | string) ?? '',
    description: i18n(raw.description as I18nString | string | null | undefined) ?? undefined,
    handle: i18n(raw.handle as I18nString | string | null | undefined) ?? undefined,
    status: mapStatus(raw.published),
    vendor: raw.brand ?? undefined,
    tags: splitTags(raw.tags),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Tiendanube product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title ? { en: product.title } : undefined,
    description: product.description ? { en: product.description } : undefined,
    handle: product.handle ? { en: product.handle } : undefined,
    published: product.status === 'ACTIVE' ? true : product.status === 'DRAFT' ? false : undefined,
    brand: product.vendor,
  }
  if (product.tags) body.tags = product.tags.join(', ')
  return body
}

/** Canonical ProductVariant → Tiendanube variant body (for create/update). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    price: variant.price != null
      ? (variant.price.amount / 100).toFixed(2)
      : undefined,
    sku: variant.sku,
    barcode: variant.barcode,
    weight: variant.weight != null ? String(variant.weight) : undefined,
  }
}
