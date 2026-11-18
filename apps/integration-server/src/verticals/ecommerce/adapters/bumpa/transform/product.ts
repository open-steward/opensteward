/**
 * Bumpa Product → canonical Product / ProductVariant.
 *
 * Bumpa products contain nested variants (called "product_variants") and
 * images. The canonical model mirrors this with first-class variant arrays.
 *
 * Bumpa stores prices as decimal major-unit strings (e.g. "4999.00" NGN).
 * We convert to integer minor units via majorToMinor().
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Bumpa shapes ─────────────────────────────────────────────────────────

export interface RawBumpaProductImage {
  id?: number | string
  url?: string
  image_url?: string
  position?: number
  [key: string]: unknown
}

export interface RawBumpaVariant {
  id: number | string
  product_id?: number | string
  name?: string
  title?: string
  price?: string | number
  compare_price?: string | number | null
  sku?: string
  quantity?: number
  stock?: number
  weight?: number
  weight_unit?: string
  [key: string]: unknown
}

export interface RawBumpaProduct {
  id: number | string
  name?: string
  title?: string
  description?: string
  slug?: string
  handle?: string
  type?: string
  product_type?: string
  status?: string
  currency?: string
  price?: string | number
  compare_price?: string | number | null
  sku?: string
  quantity?: number
  stock?: number
  tags?: string | string[]
  images?: RawBumpaProductImage[]
  product_variants?: RawBumpaVariant[]
  variants?: RawBumpaVariant[]
  created_at?: string
  updated_at?: string
  published_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(Number.isFinite(n) ? n : 0, currency)
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  switch (s.toLowerCase()) {
    case 'active':
    case 'published':
      return 'ACTIVE'
    case 'draft':
    case 'inactive':
      return 'DRAFT'
    case 'archived':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function parseTags(tags: string | string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.filter((t) => t.length > 0)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function transformImage(raw: RawBumpaProductImage): Image | undefined {
  const url = raw.url ?? raw.image_url
  if (!url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    position: raw.position,
  }
}

export function transformVariant(
  raw: RawBumpaVariant,
  currency: string = 'NGN',
): ProductVariant {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    title: raw.name ?? raw.title,
    price: { amount: toMoney(raw.price, currency), currency },
    compareAtPrice:
      raw.compare_price != null && raw.compare_price !== ''
        ? { amount: toMoney(raw.compare_price, currency), currency }
        : undefined,
    weight: raw.weight,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawBumpaProduct): Product {
  const currency = (raw.currency as string | undefined) ?? 'NGN'
  const rawVariants = raw.product_variants ?? raw.variants ?? []
  const variants = rawVariants.map((v) => transformVariant(v, currency))

  // If no explicit variants, synthesize a default one from the product-level
  // price/sku/quantity so inventory data is not lost.
  const effectiveVariants =
    variants.length > 0
      ? variants
      : [
          {
            id: String(raw.id),
            productId: String(raw.id),
            sku: raw.sku || undefined,
            price: { amount: toMoney(raw.price, currency), currency },
            compareAtPrice:
              raw.compare_price != null && raw.compare_price !== ''
                ? { amount: toMoney(raw.compare_price, currency), currency }
                : undefined,
            metadata: {},
          } satisfies ProductVariant,
        ]

  const rawImages = (raw.images ?? [])
    .map(transformImage)
    .filter((img): img is Image => img !== undefined)

  return {
    id: String(raw.id),
    title: (raw.name ?? raw.title) as string,
    description: raw.description ?? undefined,
    handle: raw.slug ?? raw.handle,
    status: mapStatus(raw.status),
    productType: raw.type ?? raw.product_type ?? undefined,
    tags: parseTags(raw.tags as string | string[] | undefined),
    variants: effectiveVariants,
    images: rawImages.length > 0 ? rawImages : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Bumpa product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    type: product.productType,
    status: product.status ? product.status.toLowerCase() : undefined,
  }
  if (product.tags) {
    body['tags'] = product.tags.join(',')
  }
  // Use the first variant's price as the product-level price if present.
  // Canonical amount is in minor units (integer cents); Bumpa expects major-unit
  // decimal (e.g. 1999 NGN cents → 19.99). Convert with minorToMajor().
  const firstVariant = product.variants?.[0]
  if (firstVariant?.price != null) {
    body['price'] = minorToMajor(firstVariant.price.amount, firstVariant.price.currency)
    body['sku'] = firstVariant.sku
  }
  return body
}

/** Canonical ProductVariant → Bumpa variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  // Canonical amounts are minor-unit integers; Bumpa expects major-unit decimals.
  return {
    name: variant.title,
    sku: variant.sku,
    price: minorToMajor(variant.price?.amount, variant.price?.currency),
    compare_price: minorToMajor(variant.compareAtPrice?.amount, variant.compareAtPrice?.currency),
    weight: variant.weight,
    weight_unit: variant.weightUnit,
  }
}
