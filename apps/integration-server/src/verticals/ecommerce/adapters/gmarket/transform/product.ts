/**
 * Gmarket Product → canonical Product.
 *
 * Gmarket's seller API models products with a `goodsNo` (item number)
 * as the primary identifier and a seller-defined `sellerItemCode` (SKU).
 *
 * Canonical `Product.id` = `goodsNo` (string).
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGmarketImage {
  imageUrl: string
  imageType?: string
  sortOrder?: number
}

export interface RawGmarketProduct {
  goodsNo: string
  sellerItemCode?: string
  goodsName?: string
  goodsDescription?: string
  brandName?: string
  categoryCode?: string
  categoryName?: string
  salePrice?: number
  currency?: string
  stockQuantity?: number
  saleStatus?: string
  imageUrls?: string[]
  images?: RawGmarketImage[]
  registDate?: string
  modifyDate?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Gmarket sale status to canonical product status.
 * Gmarket statuses: ON_SALE, STOP_SALE, WAITING, SOLD_OUT
 */
function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'ON_SALE':
      return 'ACTIVE'
    case 'STOP_SALE':
    case 'SOLD_OUT':
      return 'ARCHIVED'
    case 'WAITING':
      return 'DRAFT'
    default:
      return undefined
  }
}

function extractImages(raw: RawGmarketProduct): Image[] | undefined {
  // Prefer structured images array if available
  if (raw.images && raw.images.length > 0) {
    return raw.images.map((img, i) => ({
      url: img.imageUrl,
      position: img.sortOrder ?? i,
    }))
  }
  // Fall back to flat imageUrls
  if (raw.imageUrls && raw.imageUrls.length > 0) {
    return raw.imageUrls.map((url, i) => ({
      url,
      position: i,
    }))
  }
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Gmarket product → canonical Product.
 */
export function transformProduct(raw: RawGmarketProduct): Product {
  const images = extractImages(raw)

  return {
    id: raw.goodsNo,
    title: raw.goodsName ?? raw.goodsNo,
    description: raw.goodsDescription,
    status: mapStatus(raw.saleStatus),
    vendor: raw.brandName ?? undefined,
    productType: raw.categoryName ?? undefined,
    createdAt: raw.registDate,
    updatedAt: raw.modifyDate,
    metadata: raw as unknown as Record<string, unknown>,
    images,
  }
}

/**
 * Canonical Product → Gmarket product create/update body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.title) body['goodsName'] = data.title
  if (data.description) body['goodsDescription'] = data.description
  if (data.vendor) body['brandName'] = data.vendor
  if (data.images && data.images.length > 0) {
    body['imageUrls'] = data.images.map((img) => img.url)
  }

  // Pass through raw attributes from metadata
  const rawMeta = data.metadata as Record<string, unknown> | undefined
  if (rawMeta?.['categoryCode']) body['categoryCode'] = rawMeta['categoryCode']
  if (rawMeta?.['salePrice']) body['salePrice'] = rawMeta['salePrice']
  if (rawMeta?.['currency']) body['currency'] = rawMeta['currency']
  if (rawMeta?.['saleStatus']) body['saleStatus'] = rawMeta['saleStatus']

  return body
}
