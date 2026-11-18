/**
 * BetterCommerce Product → canonical Product / ProductVariant.
 *
 * BetterCommerce represents products as catalog items with nested
 * `variantProducts` (child SKUs). The top-level product holds `listPrice` /
 * `price` and the `images` array; each variant overrides those where applicable.
 *
 * Field mapping:
 *  recordId / productId  → id
 *  name                  → title
 *  description           → description (may be HTML)
 *  slug                  → handle
 *  brand                 → vendor
 *  classification        → productType
 *  listPrice             → compareAtPrice (major units → minor)
 *  price                 → price (major units → minor)
 *  stockCode / sku       → sku
 *  images                → images array
 *  variantProducts       → variants
 *  attributes            → optionValues (key/value pairs)
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawBCImage {
  url?: string
  alt?: string | null
  name?: string
  displayOrder?: number
  isActive?: boolean
  tag?: string
  [key: string]: unknown
}

export interface RawBCAttribute {
  key?: string
  value?: string
  fieldName?: string
  fieldValue?: string
  [key: string]: unknown
}

export interface RawBCVariantProduct {
  recordId?: string
  productId?: string
  stockCode?: string
  sku?: string
  name?: string
  price?: number | string | null
  listPrice?: number | string | null
  currentStock?: number
  images?: RawBCImage[]
  attributes?: RawBCAttribute[]
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

export interface RawBCProduct {
  recordId?: string
  productId?: string
  name?: string
  description?: string | null
  shortDescription?: string | null
  slug?: string
  stockCode?: string
  sku?: string
  brand?: string
  brandSlug?: string
  classification?: string
  price?: number | string | null
  listPrice?: number | string | null
  currentStock?: number
  images?: RawBCImage[]
  attributes?: RawBCAttribute[]
  variantProducts?: RawBCVariantProduct[]
  sellableType?: string
  weight?: number
  weightUnit?: string
  createdAt?: string
  updatedAt?: string
  publishedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** BetterCommerce is UK-headquartered; default currency for minor-unit math. */
const DEFAULT_CURRENCY = 'GBP'

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapImage(raw: RawBCImage): Image | undefined {
  const url = raw.url
  if (!url) return undefined
  return {
    url,
    alt: raw.alt ?? raw.name ?? undefined,
    position: raw.displayOrder,
  }
}

function mapImages(raws: RawBCImage[] | undefined): Image[] | undefined {
  if (!raws || raws.length === 0) return undefined
  const out = raws.map(mapImage).filter((i): i is Image => !!i)
  return out.length > 0 ? out : undefined
}

function mapAttributes(
  attrs: RawBCAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attrs || attrs.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attrs) {
    const k = a.fieldName ?? a.key
    const v = a.fieldValue ?? a.value
    if (k && v != null) out[k] = String(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function mapStatus(raw: RawBCProduct): ProductStatus | undefined {
  const sellable = raw.sellableType
  if (sellable != null) {
    const lower = String(sellable).toLowerCase()
    if (lower === 'active' || lower === 'instock' || lower === 'available') return 'ACTIVE'
    if (lower === 'inactive' || lower === 'discontinued') return 'ARCHIVED'
    if (lower === 'draft') return 'DRAFT'
  }
  return undefined
}

function buildVariantPrice(
  price: number | string | null | undefined,
  listPrice: number | string | null | undefined,
  currency: string,
): { price: { amount: number; currency: string }; compareAtPrice?: { amount: number; currency: string } } {
  const priceNum = toNum(price)
  const listNum = toNum(listPrice)
  const compareAt =
    listNum > 0 && listNum !== priceNum
      ? { amount: majorToMinor(listNum, currency), currency }
      : undefined
  return {
    price: { amount: majorToMinor(priceNum, currency), currency },
    compareAtPrice: compareAt,
  }
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawBCVariantProduct,
  parentId?: string,
  currency: string = DEFAULT_CURRENCY,
): ProductVariant {
  const id = raw.recordId ?? raw.productId ?? ''
  const { price, compareAtPrice } = buildVariantPrice(raw.price, raw.listPrice, currency)

  return {
    id,
    productId: parentId,
    sku: raw.stockCode ?? raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price,
    compareAtPrice,
    weight: raw.weight,
    weightUnit: mapWeightUnit(raw.weightUnit),
    optionValues: mapAttributes(raw.attributes),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(raw: RawBCProduct, currency: string = DEFAULT_CURRENCY): Product {
  const id = raw.recordId ?? raw.productId ?? ''
  const { price, compareAtPrice } = buildVariantPrice(raw.price, raw.listPrice, currency)

  const variants: ProductVariant[] =
    raw.variantProducts && raw.variantProducts.length > 0
      ? raw.variantProducts.map((v) => transformVariant(v, id, currency))
      : [
          {
            id,
            productId: id,
            sku: raw.stockCode ?? raw.sku ?? undefined,
            title: raw.name ?? undefined,
            price,
            compareAtPrice,
            weight: raw.weight,
            weightUnit: mapWeightUnit(raw.weightUnit),
            optionValues: mapAttributes(raw.attributes),
            metadata: raw as unknown as Record<string, unknown>,
          },
        ]

  return {
    id,
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw),
    vendor: raw.brand ?? undefined,
    productType: raw.classification ?? undefined,
    variants,
    images: mapImages(raw.images),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    publishedAt: raw.publishedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → BetterCommerce create/update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    brand: product.vendor,
    classification: product.productType,
  }
  if (product.variants?.[0]) {
    const v = product.variants[0]
    // price is in integer minor units; BetterCommerce expects major-unit decimal.
    body.price = minorToMajor(v.price?.amount, v.price?.currency)
    body.stockCode = v.sku
  }
  return body
}

/** Canonical ProductVariant → BetterCommerce variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    stockCode: variant.sku,
    // price is in integer minor units; BetterCommerce expects major-unit decimal.
    price: minorToMajor(variant.price?.amount, variant.price?.currency),
    name: variant.title,
    weight: variant.weight,
  }
}
