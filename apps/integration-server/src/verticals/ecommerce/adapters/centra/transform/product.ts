/**
 * Centra Order API Product → canonical Product / ProductVariant.
 *
 * Centra's `/products` endpoint returns a flat list of "display items" —
 * each object represents one size/stock-item variant. Fields:
 *  - `productId` / `product` — parent product id / internal name
 *  - `name`                  — external (display) product name
 *  - `variantId` / `variant` — variant id / name (e.g. colour)
 *  - `stockItemId` / `size`  — size-level stock item id / size label
 *  - `sku` / `variantSku` / `sizeSku`
 *  - `ean`
 *  - `prices[]`              — [{id, pricelist, price, currency, …}]
 *  - `images[]`              — array of hosted image URL strings
 *  - `active`                — boolean
 *  - `categories[]`          — [{categoryId, name, …}]
 *
 * We group by `productId` to rebuild canonical Products with nested variants.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Product, ProductVariant, ProductStatus, WeightUnit } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Centra shapes ────────────────────────────────────────────────────────

export interface RawCentraPrice {
  id?: number | string
  pricelist?: string
  price?: string | number
  priceReduction?: string | number
  currency?: string
}

export interface RawCentraCategory {
  categoryId?: number | string
  name?: string
  [key: string]: unknown
}

export interface RawCentraProductItem {
  /** Parent product */
  productId: number | string
  product?: string          // internal product name
  name?: string             // external (display) product name
  sku?: string

  /** Variant */
  variantId?: number | string
  variant?: string          // variant name (e.g. colour)
  variantSku?: string

  /** Size / stock item */
  stockItemId?: number | string
  size?: string
  sizeSku?: string
  ean?: string

  weight?: string | number
  weightUnit?: string
  countryOfOrigin?: string

  active?: boolean

  folder?: string
  categories?: RawCentraCategory[]
  images?: string[]         // array of hosted image URLs
  prices?: RawCentraPrice[]

  modified?: string
  created?: string

  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function mapStatus(active: boolean | undefined): ProductStatus | undefined {
  if (active === undefined) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function mapImages(urls: string[] | undefined): Image[] | undefined {
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, idx) => ({ url, position: idx }))
}

/**
 * Pick the best price from the prices array: prefer the first entry, fall
 * back to zero. Returns `{ amount, currency }` in minor units.
 */
function pickPrice(prices: RawCentraPrice[] | undefined): { amount: number; currency: string } {
  const p = prices?.[0]
  const currency = p?.currency ?? 'USD'
  const raw = toNum(p?.price)
  return { amount: majorToMinor(raw, currency), currency }
}

// ── Variant transform ────────────────────────────────────────────────────────

export function transformVariant(item: RawCentraProductItem): ProductVariant {
  const price = pickPrice(item.prices)
  const optionValues: Record<string, string> = {}
  if (item.variant) optionValues['Variant'] = item.variant
  if (item.size) optionValues['Size'] = item.size

  return {
    id: item.stockItemId != null
      ? String(item.stockItemId)
      : String(item.variantId ?? item.productId),
    productId: String(item.productId),
    sku: item.sizeSku || item.variantSku || item.sku || undefined,
    barcode: item.ean || undefined,
    title: [item.variant, item.size].filter(Boolean).join(' / ') || undefined,
    price,
    weight: item.weight != null ? toNum(item.weight) : undefined,
    weightUnit: mapWeightUnit(item.weightUnit),
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: item as unknown as Record<string, unknown>,
  }
}

// ── Product transform ────────────────────────────────────────────────────────

/**
 * Group a flat list of Centra product items into canonical Products.
 * Each unique `productId` becomes one Product with nested variants.
 */
export function groupProductItems(items: RawCentraProductItem[]): Product[] {
  const byProduct = new Map<string, RawCentraProductItem[]>()
  for (const item of items) {
    const pid = String(item.productId)
    const bucket = byProduct.get(pid) ?? []
    bucket.push(item)
    byProduct.set(pid, bucket)
  }
  return Array.from(byProduct.values()).map((group) =>
    transformProduct(group[0]!, group),
  )
}

export function transformProduct(
  first: RawCentraProductItem,
  allItems: RawCentraProductItem[] = [first],
): Product {
  const variants = allItems.map(transformVariant)
  const images = mapImages(first.images)
  const categories = (first.categories ?? [])
    .map((c) => c.name)
    .filter((n): n is string => !!n)

  return {
    id: String(first.productId),
    title: first.name || first.product || String(first.productId),
    handle: undefined,
    status: mapStatus(first.active),
    vendor: undefined,
    productType: categories[0],
    tags: categories.length > 0 ? categories : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: toIsoDatetime(first.created),
    updatedAt: toIsoDatetime(first.modified),
    metadata: first as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Centra product body (for mutations). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    active: product.status !== undefined ? product.status === 'ACTIVE' : undefined,
  }
}

/** Canonical ProductVariant → Centra stock-item body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sizeSku: variant.sku,
    ean: variant.barcode,
    weight: variant.weight,
    weightUnit: variant.weightUnit,
  }
}
