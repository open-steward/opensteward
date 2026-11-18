/**
 * Recharge Product → canonical Product.
 *
 * Recharge products represent subscription-eligible catalog items. They have
 * top-level metadata and a `subscription_defaults` object for subscription
 * cadence settings. Variants carry external_variant_id, sku, title, price,
 * and optionally images.
 *
 * A Recharge product is linked to an external ecommerce platform product via
 * `external_product_id.ecommerce`. We expose this as the canonical id when the
 * Recharge numeric id is the primary key, and surface the external id in metadata.
 *
 * Docs: https://developer.rechargepayments.com/2021-01/products/products_retrieve
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeProductImage {
  large?: string | null
  medium?: string | null
  original?: string | null
  small?: string | null
  sort_order?: number | null
}

export interface RawRechargeProductVariant {
  id?: number | string | null
  external_variant_id?: string | null
  sku?: string | null
  title?: string | null
  price?: string | number | null
  [key: string]: unknown
}

export interface RawRechargeSubscriptionDefaults {
  charge_interval_frequency?: number | null
  cutoff_day_of_month?: number | null
  cutoff_day_of_week?: number | null
  expire_after_specific_number_of_charges?: number | null
  order_interval_frequency?: number | null
  order_interval_unit?: string | null
  [key: string]: unknown
}

export interface RawRechargeProduct {
  id: number | string
  external_product_id?: string | null
  title?: string | null
  handle?: string | null
  status?: string | null
  images?: RawRechargeProductImage | null
  subscription_defaults?: RawRechargeSubscriptionDefaults | null
  variants?: RawRechargeProductVariant[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(raw: string | null | undefined): ProductStatus | undefined {
  if (!raw) return undefined
  switch (raw.toLowerCase()) {
    case 'active':
      return 'ACTIVE'
    case 'inactive':
    case 'archived':
      return 'ARCHIVED'
    case 'draft':
      return 'DRAFT'
    default:
      return undefined
  }
}

function mapImages(raw: RawRechargeProductImage | null | undefined): Image[] | undefined {
  if (!raw) return undefined
  const url = raw.original ?? raw.large ?? raw.medium ?? raw.small
  if (!url) return undefined
  return [
    {
      url,
      position: raw.sort_order ?? 0,
    },
  ]
}

function mapVariant(
  raw: RawRechargeProductVariant,
  productId: string,
  currency: string,
): ProductVariant {
  const priceMajor =
    typeof raw.price === 'string' ? parseFloat(raw.price) : (raw.price ?? 0)
  return {
    id: raw.id != null ? String(raw.id) : (raw.external_variant_id ?? `${productId}:default`),
    productId,
    sku: raw.sku ?? undefined,
    title: raw.title ?? undefined,
    price: { amount: majorToMinor(priceMajor, currency), currency },
    metadata: raw as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawRechargeProduct, currency: string = 'USD'): Product {
  const productId = String(raw.id)
  const images = mapImages(raw.images)

  const variants = (raw.variants ?? []).map((v) => mapVariant(v, productId, currency))

  // If no variants returned, synthesize a default so downstream code can
  // always iterate product.variants.
  if (variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      price: { amount: 0, currency },
      metadata: {
        synthetic: true,
        reason: 'Recharge product has no variants in this response',
        parentProductId: productId,
      },
    })
  }

  return {
    id: productId,
    title: raw.title ?? '',
    handle: raw.handle ?? undefined,
    status: mapStatus(raw.status),
    variants,
    images: images && images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    title: product.title,
    handle: product.handle,
    status:
      product.status === 'ACTIVE'
        ? 'active'
        : product.status === 'ARCHIVED'
          ? 'inactive'
          : product.status === 'DRAFT'
            ? 'draft'
            : undefined,
  }
}
