/**
 * IZBERG ProductOffer / ProductVariation → canonical Product / ProductVariant.
 *
 * In the IZBERG data model there are two distinct entities:
 *
 *  - `product`       — the abstract catalog item (brand, description, images).
 *    Endpoint: GET /v1/product/{id}/
 *  - `productoffer`  — a merchant-specific offer linked to a product, carrying
 *    price, stock, and currency per variation. Merchants manage offers, NOT the
 *    underlying product catalog.
 *    Endpoint: GET /v1/productoffer/, GET /v1/productoffer/{id}/
 *  - `product_variation` — a variation (size, color, etc.) nested under an offer.
 *
 * We surface the `productoffer` as the canonical Product and each
 * `product_variation` as a canonical ProductVariant, since that is what
 * merchants create and manage.
 *
 * Prices from the API are decimal major-unit strings (e.g. "19.99"); canonical
 * Money uses integer minor units (cents). We use `majorToMinor` for conversion.
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw IZBERG shapes ────────────────────────────────────────────────────────

export interface RawIzbergProductVariation {
  id: number | string
  name?: string | null
  price?: string | number | null
  stock?: number | null
  sku?: string | null
  is_default?: boolean
  weight?: number | null
  weight_unit?: string | null
  description?: string | null
  [key: string]: unknown
}

export interface RawIzbergProductOfferImage {
  id?: number | string
  url?: string
  order?: number
  [key: string]: unknown
}

export interface RawIzbergProductOffer {
  id: number | string
  resource_uri?: string
  name?: string | null
  description?: string | null
  price?: string | number | null
  currency?: string | null
  status?: number | null // 0=inactive, 10=active, 90=hidden
  merchant?: number | string | null
  product?: number | string | Record<string, unknown> | null
  variations?: RawIzbergProductVariation[]
  images?: RawIzbergProductOfferImage[]
  default_image_url?: string | null
  sku?: string | null
  slug?: string | null
  updated_at?: string | null
  created_at?: string | null
  published_at?: string | null
  tags?: string[] | null
  vendor?: string | null
  [key: string]: unknown
}

// Alias for index.ts imports that match the product shape
export type RawIzbergProduct = RawIzbergProductOffer

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinor(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, currency)
}

/**
 * IZBERG offer status codes:
 *   0  = inactive (ARCHIVED)
 *  10  = active   (ACTIVE)
 *  90  = hidden   (DRAFT)
 */
function mapStatus(status: number | null | undefined): ProductStatus | undefined {
  if (status == null) return undefined
  if (status === 10) return 'ACTIVE'
  if (status === 90) return 'DRAFT'
  if (status === 0) return 'ARCHIVED'
  return undefined
}

function transformImage(raw: RawIzbergProductOfferImage): Image | undefined {
  const url = raw.url
  if (!url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    position: raw.order,
  }
}

export function transformVariant(
  raw: RawIzbergProductVariation,
  offerId: string,
  currency: string,
): ProductVariant {
  return {
    id: String(raw.id),
    productId: offerId,
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price: { amount: toMinor(raw.price, currency), currency },
    weight: raw.weight != null ? Number(raw.weight) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawIzbergProductOffer): Product {
  const offerId = String(raw.id)
  const currency = raw.currency ?? 'EUR'

  const images: Image[] = []
  if (raw.default_image_url) {
    images.push({ url: raw.default_image_url, position: 0 })
  }
  for (const img of raw.images ?? []) {
    const t = transformImage(img)
    if (t) images.push(t)
  }

  const variants = (raw.variations ?? []).map((v) =>
    transformVariant(v, offerId, currency),
  )

  // If no variations, synthesize one from the offer-level price
  if (variants.length === 0 && raw.price != null) {
    variants.push({
      id: `${offerId}:default`,
      productId: offerId,
      sku: raw.sku ?? undefined,
      price: { amount: toMinor(raw.price, currency), currency },
      metadata: { synthetic: true, reason: 'IZBERG offer has no variations' },
    })
  }

  return {
    id: offerId,
    title: raw.name ?? String(raw.id),
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.status),
    vendor: raw.vendor ?? undefined,
    tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    publishedAt: toIsoDatetime(raw.published_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → IZBERG productoffer body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
  }
  if (product.status != null) {
    body['status'] = product.status === 'ACTIVE' ? 10 : product.status === 'DRAFT' ? 90 : 0
  }
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.price?.amount != null) {
      const currency = v.price.currency
      // Convert minor → major-unit decimal string (currency-aware)
      const major = minorToMajor(v.price.amount, currency)
      body['price'] = major != null ? major.toFixed(2) : '0.00'
      body['currency'] = currency
    }
  }
  return body
}
