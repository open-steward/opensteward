/**
 * Quickbutik Product / Variant → canonical Product / ProductVariant.
 *
 * Quickbutik returns products under `{ product: [...] }` for list requests
 * (without search) or as a direct array `[...]` when the `search` param is
 * used. The adapter normalises both shapes before passing here.
 *
 * Variants live under `product.variants` when `include_details=true`. Simple
 * products (no variants) have `hasVariants: false`; we synthesise a single
 * default variant from the product fields so downstream code can always
 * iterate `product.variants`.
 *
 * Prices come as strings (e.g. `"149.00"`); canonical Money is integer
 * minor units so we use `majorToMinor`.
 *
 * Status: Quickbutik's `visible` boolean maps to ACTIVE / DRAFT.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Quickbutik shapes ──────────────────────────────────────────────────────

export interface RawQuickbutikVariantValue {
  /** Dimension/option name, e.g. "Color". */
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawQuickbutikVariant {
  id: number | string
  sku?: string | null
  product_id?: number | string
  price?: string | number | null
  before_price?: string | number | null
  qty?: string | number | null
  weight?: string | number | null
  gtin?: string | null
  hidden?: boolean | 0 | 1
  values?: RawQuickbutikVariantValue[]
  [key: string]: unknown
}

export interface RawQuickbutikProduct {
  id: number | string
  title: string
  sku?: string | null
  visible?: boolean | 0 | 1
  price?: string | number | null
  before_price?: string | number | null
  qty?: string | number | null
  weight?: string | number | null
  gtin?: string | null
  description?: string | null
  date_modified?: string | null
  hasVariants?: boolean | 0 | 1
  variants?: RawQuickbutikVariant[]
  is_giftcard?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Quickbutik prices are decimal major units (e.g. "149.00" SEK/EUR/etc.).
 * Canonical Money.amount is integer minor units.
 */
function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

/**
 * Convert a Quickbutik datetime string (`"2025-01-29 11:35:39"`) to an
 * ISO 8601 string. Returns undefined for null/empty values.
 */
function toIso(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  // Quickbutik uses space-separated datetime; replace space with 'T' and
  // append 'Z' (UTC) to produce a valid ISO 8601 string.
  return raw.replace(' ', 'T') + (raw.includes('T') ? '' : 'Z')
}

function mapStatus(visible: boolean | 0 | 1 | undefined): ProductStatus | undefined {
  if (visible == null) return undefined
  return visible ? 'ACTIVE' : 'DRAFT'
}

/**
 * Build canonical `optionValues` from a variant's `values` array.
 * Each entry looks like `{ name: "Color", value: "Red" }`.
 */
function buildOptionValues(
  values: RawQuickbutikVariantValue[] | undefined,
): Record<string, string> | undefined {
  if (!values || values.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const v of values) {
    if (v.name && v.value != null) out[v.name] = String(v.value)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawQuickbutikVariant,
  productId: string,
  currency: string = 'SEK',
): ProductVariant {
  const price = toMinor(raw.price, currency)
  const beforePrice = raw.before_price != null ? toMinor(raw.before_price, currency) : undefined
  const qty = raw.qty != null ? parseInt(String(raw.qty), 10) : undefined

  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.sku ?? undefined,
    barcode: raw.gtin ?? undefined,
    price: { amount: price, currency },
    compareAtPrice:
      beforePrice != null && beforePrice > 0
        ? { amount: beforePrice, currency }
        : undefined,
    weight: raw.weight != null ? toNum(raw.weight) : undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    inventoryItemId: String(raw.id),
    optionValues: buildOptionValues(raw.values),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
      availableQty: qty,
    },
  }
}

export function transformProduct(
  raw: RawQuickbutikProduct,
  currency: string = 'SEK',
): Product {
  const productId = String(raw.id)
  const hasVariants = Boolean(raw.hasVariants)

  let variants: ProductVariant[] = []

  if (hasVariants && Array.isArray(raw.variants) && raw.variants.length > 0) {
    variants = raw.variants.map((v) => transformVariant(v, productId, currency))
  }

  // For simple (non-variant) products, synthesise a single default variant
  // so downstream code can always iterate product.variants.
  if (!hasVariants || variants.length === 0) {
    const price = toMinor(raw.price, currency)
    const beforePrice =
      raw.before_price != null ? toMinor(raw.before_price, currency) : undefined
    const qty = raw.qty != null ? parseInt(String(raw.qty), 10) : undefined

    variants = [
      {
        id: `${productId}:default`,
        productId,
        sku: raw.sku ?? undefined,
        barcode: raw.gtin ?? undefined,
        price: { amount: price, currency },
        compareAtPrice:
          beforePrice != null && beforePrice > 0
            ? { amount: beforePrice, currency }
            : undefined,
        weight: raw.weight != null ? toNum(raw.weight) : undefined,
        weightUnit: raw.weight != null ? 'g' : undefined,
        inventoryItemId: productId,
        metadata: {
          synthetic: true,
          reason: 'Quickbutik simple product — no variants',
          parentProductId: productId,
          availableQty: qty,
        },
      },
    ]
  }

  return {
    id: productId,
    title: raw.title,
    description: raw.description ?? undefined,
    status: mapStatus(raw.visible),
    variants,
    updatedAt: toIso(raw.date_modified),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Quickbutik product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.description,
    visible:
      product.status === 'ACTIVE'
        ? true
        : product.status === 'DRAFT' || product.status === 'ARCHIVED'
          ? false
          : undefined,
  }

  // If a single variant is provided, flatten its price onto the product.
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) {
      // Convert canonical minor units back to decimal major units (string).
      const currency = v.price.currency
      const major = minorToMajor(v.price.amount, currency)
      body['price'] = major != null ? major.toFixed(2) : undefined
    }
    if (v.compareAtPrice?.amount != null) {
      const currency = v.compareAtPrice.currency
      const major = minorToMajor(v.compareAtPrice.amount, currency)
      body['before_price'] = major != null ? major.toFixed(2) : undefined
    }
    if (v.sku) body['sku'] = v.sku
    if (v.barcode) body['gtin'] = v.barcode
  }

  return body
}

/** Canonical ProductVariant → Quickbutik variant body (for update). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const priceMajor =
    variant.price?.amount != null
      ? minorToMajor(variant.price.amount, variant.price.currency)
      : undefined
  const compareMajor =
    variant.compareAtPrice?.amount != null
      ? minorToMajor(variant.compareAtPrice.amount, variant.compareAtPrice.currency)
      : undefined
  return {
    sku: variant.sku,
    gtin: variant.barcode,
    price: priceMajor != null ? priceMajor.toFixed(2) : undefined,
    before_price: compareMajor != null ? compareMajor.toFixed(2) : undefined,
    weight: variant.weight?.toString(),
  }
}
