/**
 * ManoMano Offer → canonical Product / ProductVariant.
 *
 * ManoMano's catalogue model revolves around "offers": a seller's listing
 * against a ManoMano master-product (SKU). The Offer Information REST API
 * (/api/v1/offer-information/offers) returns one offer object per seller SKU.
 * We surface each offer as a Product with one embedded Variant.
 *
 * Offer Information API response envelope:
 *   {
 *     content: [
 *       {
 *         id_me: string,           // ManoMano master product ID
 *         sku: string,             // seller SKU
 *         price: number,           // decimal major units (e.g. 19.99 EUR)
 *         stock: integer,          // quantity in stock
 *         title: string,
 *         description: string,
 *         ean: string,
 *         category_id: string | number,
 *         category_name: string,
 *         brand: string,
 *         images: [{ url: string, alt: string }],
 *         is_sellable: boolean,
 *         currency: string,
 *         created_at: string,
 *         updated_at: string
 *       }
 *     ],
 *     pagination: { items: number, ... }
 *   }
 *
 * Docs: https://www.manomano.dev/
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

export interface RawManomanoSkuImage {
  url?: string
  alt?: string
}

export interface RawManomanoOffer {
  /** ManoMano master product ID */
  id_me?: string
  /** Seller SKU */
  sku?: string
  /** Price in major units (e.g. 19.99 EUR) — flat decimal field */
  price?: number | null
  /** Quantity in stock — flat integer field */
  stock?: number | null
  title?: string | null
  description?: string | null
  ean?: string | null
  category_id?: string | number | null
  category_name?: string | null
  brand?: string | null
  images?: RawManomanoSkuImage[]
  is_sellable?: boolean
  currency?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapImages(images: RawManomanoSkuImage[] | undefined): Image[] | undefined {
  if (!images || images.length === 0) return undefined
  const mapped = images
    .filter((i) => i.url)
    .map((i, idx) => ({
      url: i.url!,
      alt: i.alt,
      position: idx,
    }))
  return mapped.length > 0 ? mapped : undefined
}

function mapStatus(isSellable: boolean | undefined): ProductStatus | undefined {
  if (isSellable === true) return 'ACTIVE'
  if (isSellable === false) return 'ARCHIVED'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * Build a canonical ProductVariant from a ManoMano offer. The variant
 * represents the seller's specific listing (price + stock).
 */
export function transformOfferVariant(offer: RawManomanoOffer): ProductVariant {
  const currency = offer.currency ?? 'EUR'
  // price is a flat decimal major-unit field on the offer
  const priceMinor =
    offer.price != null
      ? majorToMinor(offer.price, currency)
      : 0

  return {
    id: offer.sku ?? offer.id_me ?? '',
    productId: offer.id_me ?? undefined,
    sku: offer.sku ?? undefined,
    barcode: offer.ean ?? undefined,
    title: offer.title ?? undefined,
    price: { amount: priceMinor, currency },
    metadata: offer as unknown as Record<string, unknown>,
  }
}

/**
 * Build a canonical Product from a ManoMano offer. Each offer surfaces as a
 * product with one embedded variant (the offer itself).
 */
export function transformOffer(offer: RawManomanoOffer): Product {
  const images = mapImages(offer.images)
  const variant = transformOfferVariant(offer)

  return {
    id: offer.id_me ?? offer.sku ?? '',
    title: offer.title ?? '',
    description: offer.description ?? undefined,
    handle: undefined,
    status: mapStatus(offer.is_sellable),
    vendor: offer.brand ?? undefined,
    productType: offer.category_name ?? undefined,
    images,
    variants: [variant],
    createdAt: toIsoDatetime(offer.created_at),
    updatedAt: toIsoDatetime(offer.updated_at),
    metadata: offer as unknown as Record<string, unknown>,
  }
}
