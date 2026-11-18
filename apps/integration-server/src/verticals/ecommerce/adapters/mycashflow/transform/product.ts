/**
 * MyCashflow Product / Variation → canonical Product / ProductVariant.
 *
 * MyCashflow product objects have:
 *  - Core fields: id, name, description, code (SKU), price, status, brand_id
 *  - Nested variations with their own id, name, price, code, features
 *  - Images array: each image has id, filename, and is referenced by URL
 *  - Categories array of { id, name } objects
 *  - Translations array for multilingual content
 *
 * Prices are decimal major-unit numbers (e.g. 19.99 EUR) — converted to
 * integer minor units via `majorToMinor`.
 *
 * Status: MyCashflow uses a boolean `published` / `status` string; we map to
 * the canonical ACTIVE / DRAFT / ARCHIVED triad.
 *
 * Docs: https://support.mycashflow.com/api/10-products/
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw MyCashflow shapes ────────────────────────────────────────────────────

export interface RawMyCashflowImage {
  id?: number | string
  filename?: string
  url?: string
  alt?: string | null
  position?: number
  [key: string]: unknown
}

export interface RawMyCashflowVariationFeature {
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawMyCashflowVariation {
  id: number | string
  product_id?: number | string
  name?: string
  code?: string
  /** SKU / product code — same as `code` on some API versions. */
  sku?: string
  price?: number | null
  buy_price?: number | null
  weight?: number | null
  features?: RawMyCashflowVariationFeature[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawMyCashflowProductCategory {
  id: number | string
  name?: string
  [key: string]: unknown
}

export interface RawMyCashflowProduct {
  id: number | string
  name: string
  description?: string | null
  /** URL slug. */
  slug?: string | null
  code?: string | null
  price?: number | null
  status?: string | null
  /** Some API shapes expose a boolean published flag. */
  published?: boolean | null
  brand_id?: number | string | null
  external_id?: number | string | null
  images?: RawMyCashflowImage[]
  variations?: RawMyCashflowVariation[]
  categories?: RawMyCashflowProductCategory[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapStatus(raw: RawMyCashflowProduct): ProductStatus | undefined {
  if (raw.status != null) {
    const s = String(raw.status).toUpperCase()
    if (s === 'ACTIVE' || s === 'DRAFT' || s === 'ARCHIVED') return s
    if (s === 'PUBLISHED' || s === '1' || s === 'TRUE') return 'ACTIVE'
    if (s === 'HIDDEN' || s === 'UNPUBLISHED' || s === '0' || s === 'FALSE') return 'DRAFT'
  }
  if (raw.published != null) {
    return raw.published ? 'ACTIVE' : 'DRAFT'
  }
  return undefined
}

function transformImage(raw: RawMyCashflowImage): Image | undefined {
  const url = raw.url ?? (raw.filename ? `/${raw.filename}` : undefined)
  if (!url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    alt: raw.alt ?? undefined,
    position: raw.position,
  }
}

function buildVariantOptionValues(
  features: RawMyCashflowVariationFeature[] | undefined,
): Record<string, string> | undefined {
  if (!features || features.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const f of features) {
    if (f.name != null && f.value != null) {
      out[f.name] = f.value
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawMyCashflowVariation,
  productId: string,
  currency: string = 'EUR',
): ProductVariant {
  const sku = raw.code ?? raw.sku ?? undefined
  return {
    id: String(raw.id),
    productId,
    sku: sku || undefined,
    title: raw.name ?? undefined,
    price: { amount: toMinor(raw.price, currency), currency },
    weight: raw.weight ?? undefined,
    optionValues: buildVariantOptionValues(raw.features),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(
  raw: RawMyCashflowProduct,
  currency: string = 'EUR',
): Product {
  const productId = String(raw.id)

  const images = (raw.images ?? [])
    .map(transformImage)
    .filter((img): img is Image => img != null)

  const variants = (raw.variations ?? []).map((v) =>
    transformVariant(v, productId, currency),
  )

  // If no variations, synthesise a single default variant from the product.
  if (variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.code ?? undefined,
      price: { amount: toMinor(raw.price, currency), currency },
      weight: undefined,
      metadata: {
        synthetic: true,
        reason: 'MyCashflow product has no variations',
        parentProductId: productId,
      },
    })
  }

  const productType =
    raw.categories && raw.categories.length > 0
      ? raw.categories[0]!.name ?? undefined
      : undefined

  return {
    id: productId,
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw),
    productType,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → MyCashflow product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
  }
  if (product.status != null) {
    body['published'] =
      product.status === 'ACTIVE'
        ? true
        : product.status === 'ARCHIVED' || product.status === 'DRAFT'
          ? false
          : undefined
  }
  // Flatten price from the first variant if available.
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.price?.amount != null) {
      body['price'] = minorToMajor(v.price.amount, v.price.currency)
    }
    if (v.sku) {
      body['code'] = v.sku
    }
  }
  return body
}

/** Canonical ProductVariant → MyCashflow variation body. */
export function untransformVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: variant.title,
    code: variant.sku,
    price: variant.price?.amount != null ? minorToMajor(variant.price.amount, variant.price.currency) : undefined,
    weight: variant.weight,
  }
  if (variant.optionValues) {
    body['features'] = Object.entries(variant.optionValues).map(([name, value]) => ({
      name,
      value,
    }))
  }
  return body
}
