/**
 * Bagy Product / Variant / Image → canonical.
 *
 * Bagy returns products with nested `Variant[]` and `ProductImage[]` arrays.
 * Prices are decimal major-unit strings in BRL; we convert to integer minor
 * units via `majorToMinor`.
 *
 * Key Bagy fields:
 *  - `available` (0|1) → canonical status ACTIVE / DRAFT
 *  - `promotional_price` → compareAtPrice (only when non-zero)
 *  - Variants are nested under `Variant[]`
 *  - Images are nested under `ProductImage[]` with `https`/`http` URL fields
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Bagy shapes ──────────────────────────────────────────────────────────

export interface RawBagyProductImage {
  id?: number | string
  http?: string
  https?: string
  thumbs?: Record<string, string>
}

export interface RawBagyVariant {
  id: number | string
  product_id?: number | string
  ean?: string | null
  order?: number
  price?: string | number
  promotional_price?: string | number | null
  cost_price?: string | number | null
  reference?: string | null
  stock?: number | string
  minimum_stock?: number
  weight?: number | string
  cubic_weight?: number | string
  Illustrations?: RawBagyProductImage[]
  [key: string]: unknown
}

export interface RawBagyProduct {
  id: number | string
  name: string
  ean?: string | null
  description?: string | null
  description_small?: string | null
  price?: string | number
  promotional_price?: string | number | null
  cost_price?: string | number | null
  available?: number | string
  available_in_store?: boolean | number
  category_id?: number | string | null
  category_name?: string | null
  brand?: string | null
  brand_id?: number | string | null
  reference?: string | null
  stock?: number | string
  weight?: number | string
  length?: number | string
  width?: number | string
  height?: number | string
  ncm?: string | null
  slug?: string | null
  modified?: string | null
  created?: string | null
  has_variation?: number | string
  Variant?: RawBagyVariant[]
  ProductImage?: RawBagyProductImage[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY = 'BRL'

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMoney(v: string | number | null | undefined): { amount: number; currency: string } {
  return { amount: majorToMinor(toNum(v), CURRENCY), currency: CURRENCY }
}

function mapStatus(available: number | string | undefined): ProductStatus | undefined {
  if (available == null) return undefined
  return Number(available) === 1 ? 'ACTIVE' : 'DRAFT'
}

function mapImage(raw: RawBagyProductImage, idx: number): Image | undefined {
  const url = raw.https ?? raw.http
  if (!url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    position: idx,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformVariant(raw: RawBagyVariant, productId?: string): ProductVariant {
  const price = toNum(raw.price)
  const promoPrice = toNum(raw.promotional_price)

  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : productId,
    sku: raw.reference ?? raw.ean ?? undefined,
    barcode: raw.ean ?? undefined,
    price: toMoney(price),
    compareAtPrice: promoPrice > 0 ? toMoney(promoPrice) : undefined,
    weight: raw.weight != null ? toNum(raw.weight) : undefined,
    weightUnit: 'kg',
    position: raw.order,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawBagyProduct): Product {
  const variants = (raw.Variant ?? []).map((v) => transformVariant(v, String(raw.id)))
  const images = (raw.ProductImage ?? [])
    .map((img, idx) => mapImage(img, idx))
    .filter((i): i is Image => i != null)

  const price = toNum(raw.price)
  const promoPrice = toNum(raw.promotional_price)

  // When the product has no explicit variants, synthesise one from the product itself.
  const effectiveVariants =
    variants.length === 0
      ? [
          {
            id: `${raw.id}-default`,
            productId: String(raw.id),
            sku: raw.reference ?? raw.ean ?? undefined,
            barcode: raw.ean ?? undefined,
            price: toMoney(price),
            compareAtPrice: promoPrice > 0 ? toMoney(promoPrice) : undefined,
            weight: raw.weight != null ? toNum(raw.weight) : undefined,
            weightUnit: 'kg' as const,
            metadata: {} as Record<string, unknown>,
          },
        ]
      : variants

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.available),
    vendor: raw.brand ?? undefined,
    tags: undefined,
    options: undefined,
    variants: effectiveVariants.length > 0 ? effectiveVariants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Bagy product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const firstVariant = product.variants?.[0]
  const priceMajor = minorToMajor(firstVariant?.price?.amount, firstVariant?.price?.currency ?? CURRENCY)
  const price = priceMajor != null ? priceMajor.toFixed(2) : undefined
  const compareAtPriceMajor = minorToMajor(firstVariant?.compareAtPrice?.amount, firstVariant?.compareAtPrice?.currency ?? CURRENCY)
  const compareAtPrice = compareAtPriceMajor != null ? compareAtPriceMajor.toFixed(2) : undefined

  return {
    name: product.title,
    description: product.description,
    slug: product.handle,
    brand: product.vendor,
    available: product.status === 'ACTIVE' ? 1 : product.status === 'DRAFT' ? 0 : undefined,
    price,
    promotional_price: compareAtPrice,
  }
}

/** Canonical ProductVariant → Bagy variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const priceMajor = minorToMajor(variant.price?.amount, variant.price?.currency ?? CURRENCY)
  const compareAtPriceMajor = minorToMajor(variant.compareAtPrice?.amount, variant.compareAtPrice?.currency ?? CURRENCY)
  return {
    reference: variant.sku,
    ean: variant.barcode,
    price: priceMajor != null ? priceMajor.toFixed(2) : undefined,
    promotional_price: compareAtPriceMajor != null ? compareAtPriceMajor.toFixed(2) : undefined,
    weight: variant.weight,
    order: variant.position,
  }
}
