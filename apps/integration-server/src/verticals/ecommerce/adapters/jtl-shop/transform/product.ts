/**
 * JTL-Shop Article (Artikel) → canonical Product / ProductVariant.
 *
 * JTL-Shop models products as "Artikel" with nested "Varianten". The REST API
 * returns articles under `/api/v1/articles`. Each article has:
 *  - `id`, `name`, `description`, `sku` (Artikelnummer), `status`
 *  - `prices` array (per customer group; we use the first/default price)
 *  - `images` array with `url` + optional `alt`
 *  - `categories` array (id + name)
 *  - `variants` array for configurable articles (color, size, etc.)
 *  - `stock` (integer, available quantity)
 *  - `weight` (decimal in kg), `unit` for the weight unit
 *  - `created`, `modified` — ISO 8601 timestamps
 *  - `active` boolean (true = ACTIVE, false = DRAFT)
 *
 * Prices are decimal major-unit values (e.g. 19.99 EUR); canonical Money is
 * integer minor units (cents). Use `majorToMinor`.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopImage {
  url?: string
  alt?: string | null
  position?: number
  id?: number | string
}

export interface RawJtlShopPrice {
  /** Decimal major-unit price, e.g. 19.99 */
  net?: number | string | null
  gross?: number | string | null
  /** ISO 4217 currency code */
  currency?: string
  customerGroupId?: number | string | null
}

export interface RawJtlShopVariantAttribute {
  name?: string
  value?: string
}

export interface RawJtlShopVariant {
  id: number | string
  articleId?: number | string
  sku?: string | null
  ean?: string | null
  price?: number | string | null
  prices?: RawJtlShopPrice[]
  stock?: number | null
  active?: boolean
  weight?: number | string | null
  attributes?: RawJtlShopVariantAttribute[]
  images?: RawJtlShopImage[]
  [key: string]: unknown
}

export interface RawJtlShopCategory {
  id?: number | string
  name?: string
}

export interface RawJtlShopArticle {
  id: number | string
  name?: string
  description?: string | null
  shortDescription?: string | null
  sku?: string | null
  ean?: string | null
  active?: boolean
  status?: string | null
  /** Default gross price in the shop currency */
  price?: number | string | null
  prices?: RawJtlShopPrice[]
  currency?: string
  images?: RawJtlShopImage[]
  categories?: RawJtlShopCategory[]
  variants?: RawJtlShopVariant[]
  /** Available stock quantity (integer) */
  stock?: number | null
  /** Weight in kg (decimal) */
  weight?: number | string | null
  /** Manufacturer / brand */
  manufacturer?: string | null
  /** SEO handle / URL slug */
  urlPath?: string | null
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

/** Pick the gross price from a prices array (first entry, default group). */
function pickPrice(prices: RawJtlShopPrice[] | undefined): { gross: number | null; currency: string } {
  if (!prices || prices.length === 0) return { gross: null, currency: 'EUR' }
  const first = prices[0]!
  const currency = first.currency ?? 'EUR'
  const gross = first.gross != null ? toNum(first.gross) : null
  return { gross, currency }
}

function mapStatus(active: boolean | undefined, status: string | null | undefined): ProductStatus | undefined {
  if (status) {
    const up = status.toUpperCase()
    if (up === 'ACTIVE') return 'ACTIVE'
    if (up === 'DRAFT' || up === 'INACTIVE') return 'DRAFT'
    if (up === 'ARCHIVED') return 'ARCHIVED'
  }
  if (active === true) return 'ACTIVE'
  if (active === false) return 'DRAFT'
  return undefined
}

function transformImage(raw: RawJtlShopImage, idx: number): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.url ?? '',
    alt: raw.alt ?? undefined,
    position: raw.position ?? idx,
  }
}

function buildOptionValues(
  attributes: RawJtlShopVariantAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    if (a.name && a.value != null) out[a.name] = a.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawJtlShopVariant,
  parentId: string,
  currency: string,
): ProductVariant {
  const { gross, currency: priceCurrency } = pickPrice(raw.prices)
  const effectiveCurrency = priceCurrency !== 'EUR' ? priceCurrency : currency
  const rawPrice = gross ?? raw.price
  return {
    id: `${parentId}:${raw.id}`,
    productId: parentId,
    sku: raw.sku || undefined,
    barcode: raw.ean || undefined,
    price: { amount: toMinor(rawPrice, effectiveCurrency), currency: effectiveCurrency },
    weight: raw.weight != null ? toNum(raw.weight) : undefined,
    weightUnit: 'kg',
    optionValues: buildOptionValues(raw.attributes),
    taxable: true,
    requiresShipping: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawJtlShopArticle): Product {
  const { gross, currency: priceCurrency } = pickPrice(raw.prices)
  const currency = priceCurrency !== 'EUR' ? priceCurrency : (raw.currency ?? 'EUR')
  const effectivePrice = gross ?? raw.price

  const images = (raw.images ?? []).map((img, i) => transformImage(img, i))
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, String(raw.id), currency),
  )

  // For articles without explicit variants, synthesize a single default variant
  // so downstream code can always iterate `product.variants`.
  if (variants.length === 0) {
    variants.push({
      id: `${raw.id}:default`,
      productId: String(raw.id),
      sku: raw.sku || undefined,
      barcode: raw.ean || undefined,
      price: { amount: toMinor(effectivePrice, currency), currency },
      weight: raw.weight != null ? toNum(raw.weight) : undefined,
      weightUnit: 'kg',
      taxable: true,
      requiresShipping: true,
      metadata: { synthetic: true, parentArticleId: String(raw.id) },
    })
  }

  // Derive options from variant attributes if any variants exist
  const optionNames = new Set<string>()
  for (const v of raw.variants ?? []) {
    for (const a of v.attributes ?? []) {
      if (a.name) optionNames.add(a.name)
    }
  }
  const options: ProductOption[] = optionNames.size > 0
    ? Array.from(optionNames).map((name, i) => ({
        name,
        values: Array.from(
          new Set(
            (raw.variants ?? [])
              .flatMap((v) => v.attributes ?? [])
              .filter((a) => a.name === name && a.value != null)
              .map((a) => a.value!),
          ),
        ),
        position: i,
      }))
    : []

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    handle: raw.urlPath ?? undefined,
    status: mapStatus(raw.active, raw.status),
    vendor: raw.manufacturer ?? undefined,
    productType: raw.categories?.[0]?.name ?? undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created ?? undefined,
    updatedAt: raw.modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → JTL-Shop article body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    urlPath: product.handle,
    manufacturer: product.vendor,
    active: product.status === 'ACTIVE' ? true : product.status === 'DRAFT' ? false : undefined,
  }
  if (product.tags?.length) {
    body['tags'] = product.tags
  }
  if (product.images?.length) {
    body['images'] = product.images.map((i) => ({ url: i.url, alt: i.alt }))
  }
  // Flatten single-variant price onto the article body
  if (product.variants?.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) {
      const currency = v.price.currency ?? 'EUR'
      body['prices'] = [{ gross: minorToMajor(v.price.amount, currency), currency }]
    }
    if (v.sku) body['sku'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → JTL-Shop variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sku: variant.sku,
    ean: variant.barcode,
    weight: variant.weight,
  }
  if (variant.price?.amount != null) {
    const currency = variant.price.currency ?? 'EUR'
    body['prices'] = [{ gross: minorToMajor(variant.price.amount, currency), currency }]
  }
  if (variant.optionValues) {
    body['attributes'] = Object.entries(variant.optionValues).map(([name, value]) => ({ name, value }))
  }
  return body
}
