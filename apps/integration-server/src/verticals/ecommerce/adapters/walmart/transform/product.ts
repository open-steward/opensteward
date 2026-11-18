/**
 * Walmart Item → canonical Product.
 *
 * Walmart's Items API returns marketplace items keyed by SKU. Each item
 * has a `publishedStatus`, product name, price, images, and attributes.
 *
 * Canonical `Product.id` = SKU.
 *
 * GET /v3/items → list (paginated via nextCursor / offset)
 * GET /v3/items/{sku} → get
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartImage {
  url: string
  rank?: number
}

export interface RawWalmartPrice {
  currency?: string
  amount?: number
}

export interface RawWalmartItem {
  sku: string
  wpid?: string
  upc?: string
  gtin?: string
  productName?: string
  shelf?: string
  productType?: string
  price?: RawWalmartPrice
  publishedStatus?: string
  lifecycleStatus?: string
  unpublishedReasons?: { reason?: string[] }
  images?: RawWalmartImage[]
  brand?: string
  shortDescription?: string
  mainImageUrl?: string
  additionalImageUrls?: string[]
  shelfName?: string
  productIdType?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Walmart publishedStatus / lifecycleStatus to canonical ProductStatus.
 */
function mapStatus(item: RawWalmartItem): ProductStatus | undefined {
  const published = item.publishedStatus?.toUpperCase()
  const lifecycle = item.lifecycleStatus?.toUpperCase()

  if (lifecycle === 'RETIRED') return 'ARCHIVED'
  if (published === 'PUBLISHED') return 'ACTIVE'
  if (published === 'UNPUBLISHED' || published === 'STAGE') return 'DRAFT'
  return 'DRAFT'
}

function extractImages(item: RawWalmartItem): Image[] | undefined {
  const images: Image[] = []

  // Structured images array (preferred)
  if (item.images && item.images.length > 0) {
    for (const img of item.images) {
      images.push({ url: img.url, position: img.rank ?? images.length })
    }
    return images
  }

  // Fallback to mainImageUrl + additionalImageUrls
  if (item.mainImageUrl) {
    images.push({ url: item.mainImageUrl, position: 0 })
  }
  if (item.additionalImageUrls) {
    for (const url of item.additionalImageUrls) {
      images.push({ url, position: images.length })
    }
  }

  return images.length > 0 ? images : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Walmart Item → canonical Product.
 */
export function transformProduct(raw: RawWalmartItem): Product {
  return {
    id: raw.sku,
    title: raw.productName ?? raw.sku,
    description: raw.shortDescription,
    status: mapStatus(raw),
    vendor: raw.brand,
    productType: raw.productType ?? raw.shelf,
    images: extractImages(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Walmart Item spec body for bulk item feed.
 *
 * Walmart item creation is feed-based (XML/JSON), but for the REST
 * PUT update path we can send a simplified JSON body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.id) body['sku'] = data.id
  if (data.title) body['productName'] = data.title
  if (data.description) body['shortDescription'] = data.description
  if (data.vendor) body['brand'] = data.vendor
  if (data.productType) body['productType'] = data.productType

  const images = data.images
  if (images && images.length > 0) {
    body['mainImageUrl'] = images[0]!.url
    if (images.length > 1) {
      body['additionalImageUrls'] = images.slice(1).map((img) => img.url)
    }
  }

  // Preserve raw metadata fields for passthrough
  if (data.metadata) {
    const raw = data.metadata as Record<string, unknown>
    if (raw['price'] && !body['price']) body['price'] = raw['price']
    if (raw['upc'] && !body['upc']) body['upc'] = raw['upc']
    if (raw['gtin'] && !body['gtin']) body['gtin'] = raw['gtin']
  }

  return body
}
