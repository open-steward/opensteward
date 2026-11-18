/**
 * Flipkart Listings API → canonical Product.
 *
 * Flipkart represents a seller's listing in their Listings API v3.
 * Listings are keyed by `listing_id` and contain product attributes,
 * pricing, stock, and fulfillment information. The SKU is the seller's
 * own identifier.
 *
 * Flipkart does **not** model variants as first-class resources; a
 * listing is the atomic unit. The SKU is surfaced as the canonical id.
 *
 * Docs: https://seller.flipkart.com/api-docs/listing-api.html
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFlipkartListingImage {
  url: string
  [key: string]: unknown
}

export interface RawFlipkartListing {
  listing_id: string
  sku_id?: string
  product_id?: string
  title?: string
  description?: string
  brand?: string
  category?: string
  mrp?: number
  selling_price?: number
  listing_status?: string
  stock_count?: number
  hsn?: string
  images?: RawFlipkartListingImage[]
  attributes?: Record<string, unknown>
  fulfillment_type?: string
  procurement_type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Flipkart's listing status to the canonical product status.
 * Flipkart uses ACTIVE / INACTIVE / ARCHIVED statuses.
 */
function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  const upper = status.toUpperCase()
  if (upper === 'ACTIVE') return 'ACTIVE'
  if (upper === 'INACTIVE' || upper === 'BLOCKED') return 'ARCHIVED'
  if (upper === 'DRAFT' || upper === 'PENDING') return 'DRAFT'
  return undefined
}

function extractImages(raw: RawFlipkartListing): Image[] | undefined {
  const imgs = raw.images
  if (!imgs || imgs.length === 0) return undefined
  return imgs.map((img, i) => ({
    url: img.url,
    position: i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Flipkart Listing → canonical Product.
 *
 * `listing_id` becomes the canonical `id`. The SKU, product_id, brand,
 * and category are surfaced through metadata.
 */
export function transformProduct(raw: RawFlipkartListing): Product {
  const images = extractImages(raw)

  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }
  if (raw.product_id) metadata['productId'] = raw.product_id
  if (raw.hsn) metadata['hsn'] = raw.hsn
  if (raw.fulfillment_type) metadata['fulfillmentType'] = raw.fulfillment_type

  return {
    id: raw.listing_id,
    title: raw.title ?? raw.sku_id ?? raw.listing_id,
    description: raw.description,
    status: mapStatus(raw.listing_status),
    vendor: raw.brand,
    productType: raw.category,
    images,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata,
  }
}

/**
 * Canonical Product → Flipkart Listings API create/update body.
 *
 * Callers can pass platform-specific attributes via `metadata.attributes`.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const attributes =
    (product.metadata?.['attributes'] as Record<string, unknown> | undefined) ?? {}

  const body: Record<string, unknown> = {
    ...(product.title ? { title: product.title } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.vendor ? { brand: product.vendor } : {}),
    ...(product.productType ? { category: product.productType } : {}),
    ...attributes,
  }

  // Pass through MRP and selling price from metadata if provided
  const mrp = product.metadata?.['mrp']
  const sellingPrice = product.metadata?.['selling_price']
  if (mrp != null) body['mrp'] = mrp
  if (sellingPrice != null) body['selling_price'] = sellingPrice

  return body
}
