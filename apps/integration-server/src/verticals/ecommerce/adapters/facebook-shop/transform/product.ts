/**
 * Facebook Catalog Product → canonical Product.
 *
 * Facebook's Catalog API models products under a catalog:
 *   GET /{catalog_id}/products → list
 *   GET /{product_id} → get
 *   POST /{catalog_id}/products → create
 *   POST /{product_id} → update
 *   DELETE /{product_id} → delete
 *
 * Products have a `retailer_id` (merchant SKU) and a Graph API `id`.
 * Canonical `Product.id` = Graph API `id`.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFacebookProduct {
  id: string
  name?: string
  description?: string
  price?: string
  currency?: string
  image_url?: string
  additional_image_urls?: string[]
  url?: string
  brand?: string
  category?: string
  availability?: string
  condition?: string
  retailer_id?: string
  retailer_product_group_id?: string
  review_status?: string
  sale_price?: string
  inventory?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Facebook availability / review_status to canonical product status.
 *
 * Facebook availability: 'in stock', 'out of stock', 'available for order',
 * 'discontinued', 'pending'.
 * review_status: 'approved', 'pending', 'rejected'.
 */
function mapStatus(raw: RawFacebookProduct): ProductStatus | undefined {
  const review = raw.review_status?.toLowerCase()
  if (review === 'rejected') return 'DRAFT'

  const avail = raw.availability?.toLowerCase()
  if (avail === 'in stock' || avail === 'available for order') return 'ACTIVE'
  if (avail === 'out of stock') return 'ACTIVE'
  if (avail === 'discontinued') return 'ARCHIVED'
  if (avail === 'pending' || review === 'pending') return 'DRAFT'

  return raw.name ? 'ACTIVE' : 'DRAFT'
}

/**
 * Parse Facebook price string (e.g. "19.99 USD") into amount + currency.
 */
export function parseFacebookPrice(
  priceStr: string | undefined,
  currencyOverride?: string,
): { amount: number; currency: string } | undefined {
  if (!priceStr) return undefined
  // Facebook price format: "1999" (cents) or "19.99 USD"
  const parts = priceStr.trim().split(/\s+/)
  const numStr = parts[0]
  if (!numStr) return undefined
  const n = parseFloat(numStr)
  if (Number.isNaN(n)) return undefined
  const currency = parts[1] ?? currencyOverride ?? 'USD'
  return { amount: n, currency }
}

function extractImages(raw: RawFacebookProduct): Image[] | undefined {
  const images: Image[] = []
  if (raw.image_url) {
    images.push({ url: raw.image_url, position: 0 })
  }
  if (raw.additional_image_urls) {
    raw.additional_image_urls.forEach((url, i) => {
      images.push({ url, position: i + 1 })
    })
  }
  return images.length > 0 ? images : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Facebook Catalog Product → canonical Product.
 */
export function transformProduct(raw: RawFacebookProduct): Product {
  const images = extractImages(raw)

  return {
    id: raw.id,
    title: raw.name ?? raw.retailer_id ?? raw.id,
    description: raw.description,
    status: mapStatus(raw),
    vendor: raw.brand ?? undefined,
    productType: raw.category ?? undefined,
    images,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Facebook Catalog product create/update body.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.title) body['name'] = data.title
  if (data.description) body['description'] = data.description
  if (data.vendor) body['brand'] = data.vendor
  if (data.productType) body['category'] = data.productType

  // Map images
  if (data.images && data.images.length > 0) {
    body['image_url'] = data.images[0]!.url
    if (data.images.length > 1) {
      body['additional_image_urls'] = JSON.stringify(
        data.images.slice(1).map((img) => img.url),
      )
    }
  }

  // Map status to availability
  if (data.status === 'ACTIVE') body['availability'] = 'in stock'
  else if (data.status === 'ARCHIVED') body['availability'] = 'discontinued'
  else if (data.status === 'DRAFT') body['availability'] = 'pending'

  // Preserve metadata pass-through
  const retailerId = data.metadata?.['retailer_id'] as string | undefined
  if (retailerId) body['retailer_id'] = retailerId

  const url = data.metadata?.['url'] as string | undefined
  if (url) body['url'] = url

  const price = data.metadata?.['price'] as string | undefined
  if (price) body['price'] = price

  const currency = data.metadata?.['currency'] as string | undefined
  if (currency) body['currency'] = currency

  return body
}
