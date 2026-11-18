/**
 * Skio Product / ProductVariant → canonical.
 *
 * Skio's product model mirrors Shopify's: each Product has a list of
 * ProductVariants, each variant carries a price (decimal major units), sku,
 * title, and a `platformId` (Shopify GID). The REST endpoint returns products
 * under the `data` array (handled by the client).
 *
 * Docs: https://code.skio.com/rest-api/
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Skio shapes ──────────────────────────────────────────────────────────

export interface RawSkioProductVariant {
  id: string
  platformId?: string | null
  title?: string | null
  price?: string | number | null
  sku?: string | null
  product?: { id?: string } | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface RawSkioProduct {
  id: string
  platformId?: string | null
  title?: string | null
  status?: string | null
  slug?: string | null
  imageSrc?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  site?: { id?: string; name?: string } | null
  ProductVariants?: RawSkioProductVariant[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(s: string | null | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const up = s.toUpperCase()
  if (up === 'ACTIVE' || up === 'ARCHIVED' || up === 'DRAFT') return up
  return undefined
}

function toMinorUnits(v: string | number | null | undefined, currency = 'USD'): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? majorToMinor(n, currency) : 0
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawSkioProductVariant,
  currency = 'USD',
): ProductVariant {
  const productId =
    raw.product?.id != null ? String(raw.product.id) : undefined

  return {
    id: String(raw.id),
    productId,
    sku: raw.sku ?? undefined,
    title: raw.title ?? undefined,
    price: {
      amount: toMinorUnits(raw.price, currency),
      currency,
    },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawSkioProduct, currency = 'USD'): Product {
  const variants = (raw.ProductVariants ?? []).map((v) => transformVariant(v, currency))

  const images =
    raw.imageSrc
      ? [{ url: raw.imageSrc, alt: raw.title ?? undefined }]
      : undefined

  return {
    id: String(raw.id),
    title: raw.title ?? '',
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.status),
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
