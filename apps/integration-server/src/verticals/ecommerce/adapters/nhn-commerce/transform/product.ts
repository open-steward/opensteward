/**
 * NHN Commerce (Shopby) Product → canonical Product / ProductVariant.
 *
 * Shopby returns product detail via GET /products/{productNo}. The response
 * has a `baseInfo` object and a separate `options` array. Options are the
 * purchasable SKUs (Shopby calls them 옵션/options) — each option carries
 * its own price and stock count.
 *
 * The product list endpoint (/products/search) returns lighter summary
 * objects in `items[]`. Both shapes are handled here.
 *
 * Price fields from the Shopby API are INTEGER amounts in the mall's
 * currency (Korean Won / KRW for Korean malls — 0 fractional digits). We
 * call majorToMinor for correctness with non-KRW malls.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

/** Summary item returned by GET /products/search */
export interface RawNhnProductSummary {
  productNo: number | string
  productName: string
  productNameEn?: string | null
  salePrice?: number
  immediateDiscountAmt?: number | null
  saleStatusType?: string | null
  saleStartYmdt?: string | null
  saleEndYmdt?: string | null
  brandName?: string | null
  imageUrl?: string | null
  stockCnt?: number
  saleCnt?: number
  totalReviewCount?: number
  reviewRating?: number
  [key: string]: unknown
}

/** Option row from GET /products/{productNo} */
export interface RawNhnProductOption {
  optionNo?: number | string
  mallOptionNo?: number | string
  optionManagementCd?: string | null
  optionName?: string | null
  optionValue?: string | null
  stockCnt?: number
  price?: {
    salePrice?: number
    addPrice?: number
    immediateDiscountAmt?: number | null
    buyAmt?: number
    standardAmt?: number
  }
  imageUrl?: string | null
  sold?: boolean
  optionType?: string | null
  sku?: string | null
  [key: string]: unknown
}

/** Full detail response from GET /products/{productNo} */
export interface RawNhnProductDetail {
  baseInfo: {
    productNo: number | string
    productName: string
    productNameEn?: string | null
    content?: string | null
    imageUrls?: string[]
    saleStartYmdt?: string | null
    saleEndYmdt?: string | null
    registerYmdt?: string | null
    saleStatusType?: string | null
    brandName?: string | null
    productManagementCd?: string | null
    productGroup?: string | null
    productType?: string | null
    [key: string]: unknown
  }
  options?: RawNhnProductOption[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Default currency for NHN Commerce Korean malls. */
export const DEFAULT_CURRENCY = 'KRW'

function toMoney(
  amount: number | undefined | null,
  currency = DEFAULT_CURRENCY,
): { amount: number; currency: string } {
  return { amount: majorToMinor(amount ?? 0, currency), currency }
}

function mapStatus(s: string | undefined | null): ProductStatus | undefined {
  if (!s) return undefined
  switch (s.toUpperCase()) {
    case 'ONSALE':
    case 'ON_SALE':
      return 'ACTIVE'
    case 'STOP_SELLING':
    case 'SOLDOUT':
    case 'CLOSE_SELLING':
      return 'ARCHIVED'
    case 'DRAFT':
      return 'DRAFT'
    default:
      return undefined
  }
}

function imageFromUrl(url: string | null | undefined, pos?: number): Image | undefined {
  if (!url) return undefined
  // Shopby uses protocol-relative URLs like //rlyfaazj0.cdn.toastcloud.com/...
  const src = url.startsWith('//') ? `https:${url}` : url
  return { url: src, position: pos }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformProductOption(
  raw: RawNhnProductOption,
  productNo: number | string,
  currency = DEFAULT_CURRENCY,
): ProductVariant {
  const optionNo = raw.optionNo ?? raw.mallOptionNo
  const price = raw.price
  const salePrice = price?.buyAmt ?? price?.salePrice ?? 0
  const stdPrice = price?.standardAmt
  return {
    id: optionNo != null ? String(optionNo) : String(productNo),
    productId: String(productNo),
    sku: raw.optionManagementCd ?? raw.sku ?? undefined,
    title: raw.optionValue ?? raw.optionName ?? undefined,
    price: toMoney(salePrice, currency),
    compareAtPrice:
      stdPrice != null && stdPrice > salePrice ? toMoney(stdPrice, currency) : undefined,
    optionValues:
      raw.optionName && raw.optionValue
        ? { [raw.optionName]: raw.optionValue }
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Transform a full product detail response from GET /products/{productNo}. */
export function transformProductDetail(
  raw: RawNhnProductDetail,
  currency = DEFAULT_CURRENCY,
): Product {
  const base = raw.baseInfo
  const productNo = base.productNo

  const images: Image[] = (base.imageUrls ?? [])
    .map((u, i) => imageFromUrl(u, i))
    .filter((img): img is Image => img != null)

  const variants: ProductVariant[] = (raw.options ?? []).map((opt) =>
    transformProductOption(opt, productNo, currency),
  )

  return {
    id: String(productNo),
    title: base.productName,
    description: base.content ?? undefined,
    status: mapStatus(base.saleStatusType),
    vendor: base.brandName ?? undefined,
    productType: base.productType ?? base.productGroup ?? undefined,
    images: images.length > 0 ? images : undefined,
    variants: variants.length > 0 ? variants : undefined,
    createdAt: toIsoDatetime(base.registerYmdt),
    publishedAt: toIsoDatetime(base.saleStartYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Transform a product summary item from GET /products/search. */
export function transformProductSummary(
  raw: RawNhnProductSummary,
  currency = DEFAULT_CURRENCY,
): Product {
  const img = imageFromUrl(raw.imageUrl, 0)
  const salePrice = raw.salePrice ?? 0

  return {
    id: String(raw.productNo),
    title: raw.productName,
    status: mapStatus(raw.saleStatusType),
    vendor: raw.brandName ?? undefined,
    images: img ? [img] : undefined,
    variants: [
      {
        id: String(raw.productNo),
        productId: String(raw.productNo),
        price: toMoney(salePrice, currency),
        metadata: {},
      },
    ],
    publishedAt: toIsoDatetime(raw.saleStartYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
