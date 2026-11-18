/**
 * Jumpseller Product / Variant → canonical Product / ProductVariant.
 *
 * Jumpseller's product API:
 *  - GET /products.json  → array of product objects (no envelope)
 *  - Each product has a `variants` array (options/variants).
 *  - `price` is a decimal major-unit number (e.g. 19.99).
 *  - `stock` is a number on the product; per-variant stock is in each variant.
 *  - `status` values: "available" | "not-available" | "draft"
 *  - Images are in `images` array; each has `url`.
 *  - Categories are a flat array of `{ id, name }`.
 *
 * Docs: https://jumpseller.com/support/api/
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Jumpseller shapes ─────────────────────────────────────────────────────

export interface RawJumpsellerImage {
  id?: number | string
  url?: string
  position?: number
}

export interface RawJumpsellerVariantOption {
  id?: number | string
  option?: string
  value?: string
}

export interface RawJumpsellerVariant {
  id: number | string
  price?: number | string | null
  compare_price?: number | string | null
  stock?: number | null
  sku?: string | null
  barcode?: string | null
  weight?: number | null
  weight_type?: string | null
  options?: RawJumpsellerVariantOption[]
  [key: string]: unknown
}

export interface RawJumpsellerCategory {
  id?: number | string
  name?: string
}

export interface RawJumpsellerProduct {
  id: number | string
  name: string
  description?: string | null
  permalink?: string | null
  price?: number | string | null
  compare_price?: number | string | null
  stock?: number | null
  sku?: string | null
  status?: string | null
  brand?: string | null
  weight?: number | null
  weight_type?: string | null
  currency?: string | null
  categories?: RawJumpsellerCategory[]
  variants?: RawJumpsellerVariant[]
  images?: RawJumpsellerImage[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMoney(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapStatus(s: string | null | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const lower = s.toLowerCase()
  if (lower === 'available') return 'ACTIVE'
  if (lower === 'not-available' || lower === 'not_available') return 'ARCHIVED'
  if (lower === 'draft') return 'DRAFT'
  return undefined
}

function mapWeightUnit(u: string | null | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  // Jumpseller weight_type values: 'kg', 'g', 'lb', 'oz'
  if (lower === 'kg' || lower === 'g' || lower === 'lb' || lower === 'oz') return lower
  return undefined
}

function transformImage(raw: RawJumpsellerImage, index: number): Image | undefined {
  if (!raw.url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.url,
    position: raw.position ?? index,
  }
}

function buildOptionValues(
  variant: RawJumpsellerVariant,
): Record<string, string> | undefined {
  if (!variant.options || variant.options.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const opt of variant.options) {
    if (opt.option && opt.value) {
      out[opt.option] = opt.value
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawJumpsellerVariant,
  currency: string = 'USD',
): ProductVariant {
  return {
    id: String(raw.id),
    sku: raw.sku || undefined,
    barcode: raw.barcode ?? undefined,
    price: { amount: toMoney(raw.price, currency), currency },
    compareAtPrice:
      raw.compare_price != null && raw.compare_price !== ''
        ? { amount: toMoney(raw.compare_price, currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: mapWeightUnit(raw.weight_type),
    optionValues: buildOptionValues(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawJumpsellerProduct): Product {
  const currency = raw.currency ?? 'USD'

  const images = (raw.images ?? [])
    .map((img, i) => transformImage(img, i))
    .filter((img): img is Image => img != null)

  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency))

  // Categories map to tags in the canonical schema.
  const tags = (raw.categories ?? [])
    .map((c) => c.name)
    .filter((n): n is string => !!n)

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.permalink ?? undefined,
    status: mapStatus(raw.status),
    vendor: raw.brand || undefined,
    tags: tags.length > 0 ? tags : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Jumpseller product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    description: product.description,
    permalink: product.handle,
    status: product.status
      ? product.status === 'ACTIVE'
        ? 'available'
        : product.status === 'ARCHIVED'
          ? 'not-available'
          : 'draft'
      : undefined,
    brand: product.vendor,
  }
}

/** Canonical ProductVariant → Jumpseller variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const currency = variant.price?.currency ?? variant.compareAtPrice?.currency
  return {
    sku: variant.sku,
    barcode: variant.barcode,
    // Jumpseller stores prices as decimal major units.
    price:
      variant.price?.amount != null
        ? minorToMajor(variant.price.amount, currency)
        : undefined,
    compare_price:
      variant.compareAtPrice?.amount != null
        ? minorToMajor(variant.compareAtPrice.amount, currency)
        : undefined,
    weight: variant.weight,
    weight_type: variant.weightUnit,
  }
}
