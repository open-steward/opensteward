/**
 * Mirakl Offer → canonical Product / ProductVariant.
 *
 * In Mirakl, the sellable unit is an "offer" — a seller's listing for a
 * catalog product identified by a `shop_sku` (offer-level SKU) and a
 * `product_sku` (catalog reference). The GET /api/offers endpoint returns
 * offer objects that include price and stock.
 *
 * Mapping decisions:
 *  - `offer_id` → Product.id and ProductVariant.id (composite not needed
 *    since Mirakl offers are already the atomic sellable unit).
 *  - `shop_sku` → ProductVariant.sku; `product_sku` → stored in metadata.
 *  - `price` (number, currency from separate field) → canonical Money.
 *  - `active` (boolean) → ProductStatus.
 *  - `stock_quantity` → reported in metadata; no canonical inventory ledger
 *    endpoint — use `/api/offers/stock/imports` for bulk updates.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Mirakl offer shape ────────────────────────────────────────────────────

export interface RawMiraklOfferPrice {
  unit_origin_price?: number | null
  unit_discount_price?: number | null
  discount_ranges?: Array<{
    quantity_threshold?: number
    discount_price?: number
  }> | null
  volume_prices?: Array<{
    quantity_threshold?: number
    unit_origin_price?: number
    unit_discount_price?: number | null
  }> | null
}

export interface RawMiraklOffer {
  offer_id?: string | null
  product_id?: string | null
  product_sku?: string | null
  shop_sku?: string | null
  offer_state?: string | null
  active?: boolean | null
  description?: string | null
  internal_description?: string | null
  price?: number | null
  currency_iso_code?: string | null
  origin_price?: number | null
  price_ranges?: RawMiraklOfferPrice | null
  quantity?: number | null
  min_quantity_alert?: number | null
  leadtime_to_ship?: number | null
  min_shipping_price?: number | null
  min_shipping_price_additional?: number | null
  min_shipping_zone?: string | null
  category_code?: string | null
  product_title?: string | null
  state_code?: string | null
  update_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(active: boolean | null | undefined): ProductStatus | undefined {
  if (active == null) return undefined
  return active ? 'ACTIVE' : 'ARCHIVED'
}

export function transformOffer(raw: RawMiraklOffer, currency: string = 'EUR'): Product {
  const cur = raw.currency_iso_code ?? currency
  const price = raw.price ?? 0
  const offerId = String(raw.offer_id ?? raw.shop_sku ?? '')

  const variant: ProductVariant = {
    id: offerId,
    productId: offerId,
    sku: raw.shop_sku ?? undefined,
    price: { amount: majorToMinor(price, cur), currency: cur },
    compareAtPrice:
      raw.origin_price != null && raw.origin_price !== raw.price
        ? { amount: majorToMinor(raw.origin_price, cur), currency: cur }
        : undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      product_sku: raw.product_sku,
    },
  }

  return {
    id: offerId,
    title: raw.product_title ?? raw.shop_sku ?? offerId,
    description: raw.description ?? undefined,
    status: mapStatus(raw.active),
    productType: raw.category_code ?? undefined,
    variants: [variant],
    updatedAt: toIsoDatetime(raw.update_date) ?? raw.update_date ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Build the /api/offers/imports POST body for creating/updating an offer. */
export function untransformOffer(product: Partial<Product>): Record<string, unknown> {
  const variant = product.variants?.[0]
  const currency = variant?.price?.currency ?? variant?.compareAtPrice?.currency
  const price =
    variant?.price?.amount != null
      ? minorToMajor(variant.price.amount, currency)
      : undefined
  const originPrice =
    variant?.compareAtPrice?.amount != null
      ? minorToMajor(variant.compareAtPrice.amount, currency)
      : undefined
  return {
    shop_sku: variant?.sku,
    product_id: product.id,
    description: product.description,
    active: product.status === 'ACTIVE' ? true : product.status === 'ARCHIVED' ? false : undefined,
    price,
    origin_price: originPrice,
  }
}
