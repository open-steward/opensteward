/**
 * Lemon Squeezy Product / Variant → canonical.
 *
 * Lemon Squeezy products are digital-goods listings. A Product belongs to a
 * Store and has many Variants. Variants carry the price (an integer in cents).
 * Images are served via `thumb_url` / `large_thumb_url` on the product.
 *
 * Docs: https://docs.lemonsqueezy.com/api/products
 *       https://docs.lemonsqueezy.com/api/variants
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import type { LsResource } from '../client'

// ── Raw Lemon Squeezy attribute shapes ───────────────────────────────────────

export interface RawLsProductAttributes {
  store_id: number
  name: string
  slug: string
  description?: string | null
  status: string            // "draft" | "published"
  status_formatted?: string
  thumb_url?: string | null
  large_thumb_url?: string | null
  price?: number | null     // in cents (integer)
  price_formatted?: string
  pay_what_you_want?: boolean
  from_price?: number | null
  to_price?: number | null
  buy_now_url?: string
  created_at: string
  updated_at: string
  test_mode?: boolean
  [key: string]: unknown
}

export interface RawLsVariantAttributes {
  product_id: number
  name: string
  slug: string
  description?: string | null
  price?: number | null     // in cents (integer) or a string in some SDK versions
  is_subscription?: boolean
  status: string            // "pending" | "draft" | "published"
  status_formatted?: string
  sort?: number
  has_license_keys?: boolean
  pay_what_you_want?: boolean
  min_price?: number | null
  suggested_price?: number | null
  created_at: string
  updated_at: string
  test_mode?: boolean
  [key: string]: unknown
}

export type RawLsProduct = LsResource<RawLsProductAttributes>
export type RawLsVariant = LsResource<RawLsVariantAttributes>

// ── Helpers ──────────────────────────────────────────────────────────────────

/** LS prices are already in cents (minor units). Coerce to integer. */
function toMinor(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? Math.round(n) : 0
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const up = s.toUpperCase()
  if (up === 'PUBLISHED') return 'ACTIVE'
  if (up === 'DRAFT') return 'DRAFT'
  if (up === 'ARCHIVED') return 'ARCHIVED'
  return undefined
}

function buildImages(attrs: RawLsProductAttributes): Image[] {
  const images: Image[] = []
  if (attrs.large_thumb_url) {
    images.push({ url: attrs.large_thumb_url, position: 0 })
  } else if (attrs.thumb_url) {
    images.push({ url: attrs.thumb_url, position: 0 })
  }
  return images
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawLsProduct): Product {
  const attrs = raw.attributes
  const images = buildImages(attrs)
  return {
    id: raw.id,
    title: attrs.name,
    description: attrs.description ?? undefined,
    handle: attrs.slug || undefined,
    status: mapStatus(attrs.status),
    images: images.length > 0 ? images : undefined,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  }
}

export function transformVariant(raw: RawLsVariant): ProductVariant {
  const attrs = raw.attributes
  // LS prices are in cents; coerce to integer minor units
  const priceMinor = toMinor(attrs.price)
  return {
    id: raw.id,
    productId: String(attrs.product_id),
    title: attrs.name || undefined,
    price: { amount: priceMinor, currency: 'USD' },
    position: attrs.sort,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: { id: raw.id, type: raw.type, ...attrs },
  } as ProductVariant
}
