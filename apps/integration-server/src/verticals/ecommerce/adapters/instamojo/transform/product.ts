/**
 * Instamojo Product → canonical Product.
 *
 * Instamojo exposes a products resource via the standard v2 OAuth API
 * (scope: products:read). Products represent digital or physical goods
 * listed on a merchant's Instamojo storefront. We map:
 *
 *   id          ← product.slug  (stable URL identifier; resource_uri includes slug)
 *   title       ← product.title
 *   description ← product.description
 *   handle      ← product.slug
 *   status      ← product.status  (Live → ACTIVE, Disabled → ARCHIVED)
 *   vendor      ← product.user    (the seller's resource URI)
 *   productType ← product.product_type
 *   currency    ← product.currency
 *   createdAt   ← product.created_at
 *
 * Price is stored as base_price (major units). We surface it on the default
 * variant so callers have a purchasable SKU to reference.
 *
 * Docs: https://docs.instamojo.com/page/mojo-developers-program
 *       (Products endpoint: GET /v2/products, scope: products:read)
 */

import type { Product, ProductStatus, ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawInstamojoProduct {
  /** URL-friendly identifier, used as the stable resource id. */
  slug: string
  title?: string | null
  description?: string | null
  status?: string | null
  user?: string | null
  /** ISO 4217 currency code (default INR). */
  currency?: string | null
  /** Selling price in major units (e.g. 499.00 INR). */
  base_price?: string | number | null
  min_price?: string | number | null
  max_price?: string | number | null
  product_type?: string | null
  requires_shipping?: boolean | null
  ships_within_days?: number | null
  /** Shortened shareable URL. */
  shorturl?: string | null
  /** Full product URL on Instamojo storefront. */
  resource_uri?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Map Instamojo product status to canonical ProductStatus.
 *
 * Instamojo statuses (observed values):
 *   Live     → product is publicly visible
 *   Disabled → product is hidden / archived
 *   Draft    → product not yet published
 */
const STATUS_MAP: Record<string, ProductStatus> = {
  Live: 'ACTIVE',
  live: 'ACTIVE',
  Disabled: 'ARCHIVED',
  disabled: 'ARCHIVED',
  Draft: 'DRAFT',
  draft: 'DRAFT',
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform an Instamojo product into a canonical Product.
 * The slug is used as the stable id since Instamojo does not expose a
 * numeric product id in the standard v2 API response.
 */
export function transformProduct(raw: RawInstamojoProduct): Product {
  const currency = raw.currency ?? 'INR'
  const priceNum = toNum(raw.base_price)
  const priceMinor = majorToMinor(priceNum, currency)

  const status = raw.status ? STATUS_MAP[raw.status] ?? undefined : undefined

  // Build a minimal default variant from the product-level price.
  const defaultVariant: ProductVariant = {
    id: `${raw.slug}-default`,
    productId: raw.slug,
    title: raw.title ?? undefined,
    price:
      priceMinor != null
        ? { amount: priceMinor, currency }
        : { amount: 0, currency },
    requiresShipping: raw.requires_shipping ?? undefined,
    metadata: { slug: raw.slug, base_price: raw.base_price },
  }

  return {
    id: raw.slug,
    title: raw.title ?? raw.slug,
    description: raw.description ?? undefined,
    handle: raw.slug,
    status,
    vendor: raw.user ?? undefined,
    productType: raw.product_type ?? undefined,
    variants: [defaultVariant],
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
