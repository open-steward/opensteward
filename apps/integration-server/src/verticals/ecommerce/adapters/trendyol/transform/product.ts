/**
 * Trendyol Product → canonical Product / ProductVariant.
 *
 * Trendyol product objects come from two endpoints:
 *
 *  1. GET /integration/product/sellers/{sellerId}/products
 *     Returns a paged list. Each item in `content` is a RawTrendyolProduct
 *     with fields: barcode, title, productMainId, brandName, categoryName,
 *     salePrice, listPrice, quantity, stockCode, images, attributes, etc.
 *
 *  2. GET /integration/product/sellers/{sellerId}/v2/products
 *     V2 product filter — similar shape but may carry a `productContentId`.
 *
 * Trendyol models products as flat SKUs identified by `barcode`. There is no
 * parent/variation hierarchy in the REST API response; every barcode is its
 * own product object. We synthesize a single default variant per product so
 * downstream code can always iterate `product.variants`.
 *
 * Prices are decimal numbers in TRY (Turkish lira). We call majorToMinor
 * with the currency code to convert to integer minor units (kuruş).
 *
 * The `approved` / `archived` flags map to the canonical ProductStatus:
 *   approved=true,  archived=false → ACTIVE
 *   approved=false, archived=false → DRAFT
 *   archived=true                  → ARCHIVED
 *
 * Note: product write operations (create/update) return a `batchRequestId`
 * rather than the updated product. The untransform helpers produce the
 * Trendyol-compatible request payload; the adapter must poll
 * GET /integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}
 * to confirm success.
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/product-api-endpoint
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Trendyol product shapes ──────────────────────────────────────────────

export interface RawTrendyolProductImage {
  url: string
}

export interface RawTrendyolProductAttribute {
  attributeId?: number | string
  attributeName?: string
  attributeValue?: string
  customAttributeValue?: string
}

export interface RawTrendyolProduct {
  /** Barcode serves as the primary product identifier on Trendyol. */
  barcode: string
  /** The seller-defined product main ID (groups variants conceptually). */
  productMainId?: string | null
  title?: string | null
  description?: string | null
  brandId?: number | string | null
  brandName?: string | null
  categoryId?: number | string | null
  categoryName?: string | null
  /** Stock keeping code (seller's internal SKU). */
  stockCode?: string | null
  quantity?: number | null
  salePrice?: number | null
  listPrice?: number | null
  currencyType?: string | null
  vatRate?: number | null
  /** Whether the listing is approved and visible. */
  approved?: boolean
  archived?: boolean
  /** Unique Trendyol content identifier (set after approval). */
  contentId?: number | string | null
  productContentId?: number | string | null
  images?: RawTrendyolProductImage[]
  attributes?: RawTrendyolProductAttribute[]
  /** Timestamp (ms since epoch). */
  lastModifiedDate?: number | null
  createDateTime?: number | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(raw: RawTrendyolProduct): ProductStatus | undefined {
  if (raw.archived === true) return 'ARCHIVED'
  if (raw.approved === true) return 'ACTIVE'
  if (raw.approved === false) return 'DRAFT'
  return undefined
}

function transformImage(raw: RawTrendyolProductImage): Image | undefined {
  if (!raw?.url) return undefined
  return { url: raw.url }
}

function buildOptionValues(
  attributes: RawTrendyolProductAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    const name = a.attributeName
    const value = a.customAttributeValue ?? a.attributeValue
    if (name && value) out[name] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformProductVariant(
  raw: RawTrendyolProduct,
  currency: string,
): ProductVariant {
  // Trendyol's salePrice is the active selling price; listPrice is compare-at.
  const salePrice = toNum(raw.salePrice)
  const listPrice = toNum(raw.listPrice)
  const currency_ = raw.currencyType ?? currency

  return {
    id: raw.barcode,
    productId: raw.productMainId ?? raw.barcode,
    sku: raw.stockCode ?? undefined,
    barcode: raw.barcode,
    title: undefined,
    price: { amount: majorToMinor(salePrice, currency_), currency: currency_ },
    compareAtPrice:
      listPrice > 0 && listPrice > salePrice
        ? { amount: majorToMinor(listPrice, currency_), currency: currency_ }
        : undefined,
    inventoryItemId: raw.barcode,
    optionValues: buildOptionValues(raw.attributes),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawTrendyolProduct, currency = 'TRY'): Product {
  const currency_ = raw.currencyType ?? currency
  const images = (raw.images ?? [])
    .map(transformImage)
    .filter((img): img is Image => img != null)
  const variant = transformProductVariant(raw, currency_)
  const productId = raw.productMainId ?? raw.barcode

  return {
    id: raw.barcode,
    title: raw.title ?? raw.barcode,
    description: raw.description ?? undefined,
    handle: raw.stockCode ?? raw.barcode,
    status: mapStatus(raw),
    vendor: raw.brandName ?? undefined,
    productType: raw.categoryName ?? undefined,
    variants: [{ ...variant, productId }],
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.createDateTime),
    updatedAt: toIsoDatetime(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Trendyol product create/update payload.
 *
 * Returns the `items` array element suitable for wrapping in `{ items: [...] }`
 * and POSTing to the products endpoint. Callers must supply the `categoryId`,
 * `brandId`, `cargoCompanyId`, and `vatRate` in the canonical product metadata
 * or via the adapter config, as these are Trendyol-specific required fields
 * with no canonical equivalent.
 */
export function untransformProduct(
  product: Partial<Product>,
  defaults: Partial<RawTrendyolProduct> = {},
): Record<string, unknown> {
  const variant = product.variants?.[0]
  const currency = variant?.price?.currency ?? defaults.currencyType ?? 'TRY'
  const salePrice =
    variant?.price?.amount != null
      ? minorToMajor(variant.price.amount, currency)
      : undefined
  const listPrice =
    variant?.compareAtPrice?.amount != null
      ? minorToMajor(variant.compareAtPrice.amount, currency)
      : salePrice

  return {
    barcode: defaults.barcode ?? variant?.barcode ?? variant?.sku,
    title: product.title,
    productMainId: defaults.productMainId ?? (product.id || undefined),
    description: product.description,
    brandId: defaults.brandId,
    categoryId: defaults.categoryId,
    quantity: variant?.price != null ? (defaults.quantity ?? 0) : undefined,
    stockCode: variant?.sku ?? defaults.stockCode,
    salePrice,
    listPrice,
    currencyType: defaults.currencyType ?? 'TRY',
    vatRate: defaults.vatRate ?? 0,
    cargoCompanyId: defaults.cargoCompanyId,
    images: product.images?.map((img) => ({ url: img.url })),
    attributes: defaults.attributes ?? [],
  }
}

/**
 * Trendyol price+inventory batch update item.
 * Used for updatePriceAndInventory endpoint.
 */
export interface TrendyolPriceInventoryItem {
  barcode: string
  quantity: number
  salePrice: number
  listPrice: number
}
