/**
 * Shopgate Product → canonical Product / ProductVariant.
 *
 * Shopgate uses `code` (string) as the primary identifier for products and
 * variants. Products are returned from the Catalog Service. Variants are
 * nested under the product as `variants[]`.
 *
 * Money fields in the Shopgate API are decimal major-unit strings/numbers
 * (e.g. `"19.99"`). We convert them to integer minor units.
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgatePrice {
  price?: string | number | null
  salePrice?: string | number | null
  currencyCode?: string
}

export interface RawShopgateImage {
  url?: string
  altText?: string | null
  position?: number
  width?: number
  height?: number
}

export interface RawShopgateVariant {
  code: string
  productCode?: string
  name?: string
  sku?: string | null
  gtin?: string | null
  price?: RawShopgatePrice | null
  status?: string
  weight?: number
  weightUnit?: string
  images?: RawShopgateImage[]
  attributes?: Array<{ code: string; value: string }>
  [key: string]: unknown
}

export interface RawShopgateProduct {
  code: string
  name?: string
  description?: string | null
  shortDescription?: string | null
  status?: string
  vendor?: string | null
  tags?: string[]
  price?: RawShopgatePrice | null
  images?: RawShopgateImage[]
  variants?: RawShopgateVariant[]
  weight?: number
  weightUnit?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinor(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? majorToMinor(n, currency) : 0
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const up = s.toUpperCase()
  if (up === 'ACTIVE') return 'ACTIVE'
  if (up === 'INACTIVE' || up === 'ARCHIVED') return 'ARCHIVED'
  if (up === 'DRAFT') return 'DRAFT'
  return undefined
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function mapImage(raw: RawShopgateImage): Image {
  return {
    url: raw.url ?? '',
    alt: raw.altText ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

function priceToMoney(
  price: RawShopgatePrice | null | undefined,
): { amount: number; currency: string } | undefined {
  if (!price) return undefined
  const currency = price.currencyCode ?? 'USD'
  const val = price.salePrice ?? price.price
  if (val == null) return undefined
  return { amount: toMinor(val, currency), currency }
}

function compareAtPrice(
  price: RawShopgatePrice | null | undefined,
): { amount: number; currency: string } | undefined {
  // When salePrice is set, the original `price` field is the "compare-at" value.
  if (!price || price.salePrice == null || price.price == null) return undefined
  const currency = price.currencyCode ?? 'USD'
  return { amount: toMinor(price.price, currency), currency }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformVariant(raw: RawShopgateVariant): ProductVariant {
  const money = priceToMoney(raw.price)
  const compareAt = compareAtPrice(raw.price)
  return {
    id: raw.code,
    productId: raw.productCode,
    sku: raw.sku ?? undefined,
    barcode: raw.gtin ?? undefined,
    title: raw.name,
    price: money ?? { amount: 0, currency: 'USD' },
    compareAtPrice: compareAt,
    weight: raw.weight,
    weightUnit: mapWeightUnit(raw.weightUnit),
    optionValues: raw.attributes
      ? Object.fromEntries(raw.attributes.map((a) => [a.code, a.value]))
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawShopgateProduct): Product {
  const images = (raw.images ?? []).map(mapImage)
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant({ ...v, productCode: raw.code }),
  )

  return {
    id: raw.code,
    title: raw.name ?? raw.code,
    description: raw.description ?? undefined,
    status: mapStatus(raw.status),
    vendor: raw.vendor ?? undefined,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : undefined,
    images: images.length > 0 ? images : undefined,
    variants: variants.length > 0 ? variants : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Shopgate product body (create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    code: product.id,
    name: product.title,
    description: product.description,
    status: product.status,
    vendor: product.vendor,
    tags: product.tags,
    images: product.images?.map((i) => ({
      url: i.url,
      altText: i.alt,
      position: i.position,
    })),
  }
}

/** Canonical ProductVariant → Shopgate variant body (create/update). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    code: variant.id,
    productCode: variant.productId,
    sku: variant.sku,
    gtin: variant.barcode,
    name: variant.title,
    weight: variant.weight,
    weightUnit: variant.weightUnit,
    attributes: variant.optionValues
      ? Object.entries(variant.optionValues).map(([code, value]) => ({ code, value }))
      : undefined,
  }
}
