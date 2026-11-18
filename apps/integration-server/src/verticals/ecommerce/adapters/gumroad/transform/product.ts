/**
 * Gumroad Product → canonical Product.
 *
 * Gumroad products are digital goods (ebooks, courses, software, music, etc.).
 * Each product has an `id` (permalink-style string), a `name`, `description`,
 * `price` (in cents), and optional `variants`.
 *
 * Key mapping:
 *  - `id` → canonical `id`
 *  - `name` → canonical `title`
 *  - `description` → canonical `description`
 *  - `published` boolean → canonical `status` (true → ACTIVE, false → DRAFT)
 *  - `price` (cents) → not mapped to product-level price (belongs on variants)
 *  - `tags` → canonical `tags`
 *  - `preview_url` / `thumbnail_url` → canonical `images`
 *  - Variants/inventory/fulfillment: N/A for digital products.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGumroadVariantCategory {
  title: string
  options: Array<{
    name: string
    price_difference: number
    is_pay_what_you_want?: boolean
    recurrence_prices?: Record<string, unknown>
  }>
}

export interface RawGumroadProduct {
  id: string
  name?: string
  description?: string
  published?: boolean
  url?: string
  short_url?: string
  price: number // in cents
  currency?: string
  tags?: string[]
  preview_url?: string | null
  thumbnail_url?: string | null
  custom_permalink?: string | null
  custom_receipt?: string | null
  custom_summary?: string
  sales_count?: number
  sales_usd_cents?: number
  is_tiered_membership?: boolean
  variant_categories?: RawGumroadVariantCategory[]
  max_purchase_count?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function mapPublishedToStatus(published: boolean | undefined): ProductStatus | undefined {
  if (published === true) return 'ACTIVE'
  if (published === false) return 'DRAFT'
  return undefined
}

function extractImages(product: RawGumroadProduct): Image[] | undefined {
  const images: Image[] = []
  if (product.thumbnail_url) {
    images.push({
      url: product.thumbnail_url,
      position: 0,
    })
  }
  if (product.preview_url && product.preview_url !== product.thumbnail_url) {
    images.push({
      url: product.preview_url,
      position: images.length,
    })
  }
  return images.length > 0 ? images : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Gumroad Product → canonical Product.
 */
export function transformProduct(raw: RawGumroadProduct): Product {
  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }

  return {
    id: raw.id,
    title: raw.name ?? raw.id,
    description: raw.description ?? undefined,
    handle: raw.custom_permalink ?? raw.short_url ?? undefined,
    status: mapPublishedToStatus(raw.published),
    vendor: undefined,
    productType: undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    images: extractImages(raw),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata,
  }
}

/**
 * Canonical Product → Gumroad product create/update body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (product.title != null) body['name'] = product.title
  if (product.description != null) body['description'] = product.description
  if (product.tags != null) body['tags'] = product.tags

  // Pass through Gumroad-specific fields from metadata
  const meta = product.metadata ?? {}
  if (meta['price'] != null) body['price'] = meta['price']
  if (meta['currency'] != null) body['currency'] = meta['currency']
  if (meta['custom_permalink'] != null) body['custom_permalink'] = meta['custom_permalink']
  if (meta['custom_receipt'] != null) body['custom_receipt'] = meta['custom_receipt']
  if (meta['custom_summary'] != null) body['custom_summary'] = meta['custom_summary']
  if (meta['max_purchase_count'] != null) body['max_purchase_count'] = meta['max_purchase_count']

  if (product.status != null) {
    body['published'] = product.status === 'ACTIVE'
  }

  return body
}
