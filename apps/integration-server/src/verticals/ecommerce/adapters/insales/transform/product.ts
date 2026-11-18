/**
 * InSales Product / Variant / Image → canonical.
 *
 * InSales returns products under `/admin/products.json` as a plain array.
 * Each product has nested `variants` (called "modifications" in older docs
 * but exposed as `variants` in the JSON API) and `images`.
 *
 * Key InSales field names:
 *   product.id, product.title, product.description, product.permalink,
 *   product.category_id, product.is_hidden, product.created_at,
 *   product.updated_at, product.images[], product.variants[]
 *
 * Variant fields:
 *   variant.id, variant.product_id, variant.sku, variant.price,
 *   variant.old_price, variant.quantity, variant.title, variant.option_values[]
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw InSales shapes ───────────────────────────────────────────────────────

export interface RawInsalesOptionValue {
  id: number | string
  option_name_id?: number | string
  title: string
  position?: number
}

export interface RawInsalesVariant {
  id: number | string
  product_id?: number | string
  title?: string | null
  sku?: string | null
  price?: string | number
  old_price?: string | number | null
  quantity?: number | null
  weight?: string | number | null
  // InSales stores option values as nested objects
  option_values?: RawInsalesOptionValue[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawInsalesImage {
  id: number | string
  url?: string
  original_url?: string
  alt?: string | null
  position?: number
  width?: number
  height?: number
}

export interface RawInsalesOptionName {
  id: number | string
  title: string
  position?: number
  // All possible values for this option
  option_values?: RawInsalesOptionValue[]
}

export interface RawInsalesProduct {
  id: number | string
  title: string
  description?: string | null
  short_description?: string | null
  permalink?: string | null
  category_id?: number | string | null
  is_hidden?: boolean
  tags?: string | null
  vendor?: string | null
  created_at?: string
  updated_at?: string
  published_at?: string | null
  images?: RawInsalesImage[]
  variants?: RawInsalesVariant[]
  option_names?: RawInsalesOptionName[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  const n = toNum(v)
  if (n == null) return 0
  return majorToMinor(n, currency)
}

function mapStatus(isHidden: boolean | undefined): ProductStatus | undefined {
  if (isHidden == null) return undefined
  return isHidden ? 'DRAFT' : 'ACTIVE'
}

function mapImage(raw: RawInsalesImage): Image {
  return {
    id: String(raw.id),
    url: raw.url ?? raw.original_url ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

/**
 * Build canonical options from InSales option_names. InSales stores option
 * names and their allowed values under `option_names[].option_values`.
 */
function buildOptions(optionNames: RawInsalesOptionName[] | undefined): ProductOption[] | undefined {
  if (!optionNames || optionNames.length === 0) return undefined
  return optionNames.map((on) => ({
    id: String(on.id),
    name: on.title,
    values: (on.option_values ?? []).map((ov) => ov.title),
    position: on.position,
  }))
}

/**
 * Build `optionValues` record for a variant from its nested `option_values`
 * (each carries a `title` and `option_name_id`). We match the option name
 * from the product's `option_names` list.
 */
function buildVariantOptionValues(
  variant: RawInsalesVariant,
  optionNames: RawInsalesOptionName[] | undefined,
): Record<string, string> | undefined {
  if (!variant.option_values || variant.option_values.length === 0) return undefined
  const nameById = new Map<string, string>(
    (optionNames ?? []).map((on) => [String(on.id), on.title]),
  )
  const out: Record<string, string> = {}
  for (const ov of variant.option_values) {
    const key = ov.option_name_id != null
      ? (nameById.get(String(ov.option_name_id)) ?? ov.title)
      : ov.title
    out[key] = ov.title
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function splitTags(tags: string | null | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawInsalesVariant,
  currency: string = 'RUB',
  optionNames?: RawInsalesOptionName[],
): ProductVariant {
  const compareAt = toNum(raw.old_price)
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku ?? undefined,
    title: raw.title ?? undefined,
    price: { amount: toMinor(raw.price, currency), currency },
    compareAtPrice:
      compareAt != null && compareAt > 0
        ? { amount: majorToMinor(compareAt, currency), currency }
        : undefined,
    weight: toNum(raw.weight),
    optionValues: buildVariantOptionValues(raw, optionNames),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawInsalesProduct, currency: string = 'RUB'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.option_names),
  )
  const images = (raw.images ?? []).map(mapImage)
  const options = buildOptions(raw.option_names)

  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.description ?? undefined,
    handle: raw.permalink ?? undefined,
    status: mapStatus(raw.is_hidden),
    vendor: raw.vendor ?? undefined,
    tags: splitTags(raw.tags),
    options: options && options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → InSales product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.description,
    permalink: product.handle,
    is_hidden: product.status === 'DRAFT' || product.status === 'ARCHIVED' ? true : false,
    vendor: product.vendor,
  }
  if (product.tags) body.tags = product.tags.join(', ')
  if (product.variants) {
    body.variants_attributes = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      price: minorToMajor(v.price?.amount, v.price?.currency),
      old_price: minorToMajor(v.compareAtPrice?.amount, v.compareAtPrice?.currency),
    }))
  }
  if (product.images) {
    body.images_attributes = product.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      position: i.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → InSales variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    title: variant.title,
    price: minorToMajor(variant.price?.amount, variant.price?.currency),
    old_price: minorToMajor(variant.compareAtPrice?.amount, variant.compareAtPrice?.currency),
    weight: variant.weight,
  }
}
