/**
 * Salesforce Commerce Cloud (SCAPI) Product → canonical Product / ProductVariant.
 *
 * SCAPI's Shopper Products API returns camelCase JSON with a `Product` object that
 * uses "variations" and "variants":
 *   - `variants`             — purchasable SKUs (variationValues map to option axes)
 *   - `variationAttributes`  — option axes (color, size, etc.)
 *   - `imageGroups`          — arrays of images keyed by viewType
 *
 * Price is surfaced as a decimal major-unit number (e.g. 19.99); we convert to
 * integer minor units via `majorToMinor`.
 *
 * Reference: https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-products
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiImage {
  link?: string
  title?: string
  alt?: string
  disBaseLink?: string
}

export interface RawScapiImageGroup {
  images?: RawScapiImage[]
  viewType?: string // 'large', 'small', 'medium', 'swatch', etc.
}

export interface RawScapiVariationAttributeValue {
  name?: string
  value: string
  orderable?: boolean
}

export interface RawScapiVariationAttribute {
  id: string
  name?: string
  values?: RawScapiVariationAttributeValue[]
}

export interface RawScapiVariant {
  productId: string
  variationValues?: Record<string, string>
  price?: number
  tieredPrices?: Array<{ price: number; pricebook: string; quantity: number }>
  orderable?: boolean
}

export interface RawScapiProduct {
  id: string
  name?: string
  shortDescription?: string
  longDescription?: string
  brand?: string
  primaryCategoryId?: string
  currency?: string
  price?: number
  priceMax?: number
  imageGroups?: RawScapiImageGroup[]
  variants?: RawScapiVariant[]
  variationAttributes?: RawScapiVariationAttribute[]
  online?: boolean
  available?: boolean
  orderable?: boolean
  createdAt?: string
  lastModified?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapImages(groups: RawScapiImageGroup[] | undefined): Image[] | undefined {
  if (!groups || groups.length === 0) return undefined
  // Prefer 'large' view type; fall back to the first available group.
  const preferred = groups.find((g) => g.viewType === 'large') ?? groups[0]
  if (!preferred?.images || preferred.images.length === 0) return undefined
  const result: Image[] = []
  preferred.images.forEach((img, idx) => {
    if (img.link) {
      result.push({
        url: img.link,
        alt: img.alt ?? img.title ?? undefined,
        position: idx,
      })
    }
  })
  return result.length > 0 ? result : undefined
}

function mapOptions(
  attrs: RawScapiVariationAttribute[] | undefined,
): ProductOption[] | undefined {
  if (!attrs || attrs.length === 0) return undefined
  return attrs.map((attr, idx) => ({
    id: attr.id,
    name: attr.name ?? attr.id,
    values: (attr.values ?? []).map((v) => v.name ?? v.value),
    position: idx,
  }))
}

function mapStatus(product: RawScapiProduct): ProductStatus | undefined {
  if (product.online === false) return 'ARCHIVED'
  if (product.online === true) return 'ACTIVE'
  return undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawScapiVariant,
  parentProduct: RawScapiProduct,
): ProductVariant {
  const currency = parentProduct.currency ?? 'USD'
  const price = raw.price ?? parentProduct.price ?? 0
  return {
    id: raw.productId,
    productId: parentProduct.id,
    price: { amount: majorToMinor(price, currency), currency },
    optionValues: raw.variationValues ?? undefined,
    taxable: true,
    requiresShipping: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawScapiProduct): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, raw))
  const images = mapImages(raw.imageGroups)
  const options = mapOptions(raw.variationAttributes)

  return {
    id: raw.id,
    title: raw.name ?? raw.id,
    description: raw.longDescription ?? raw.shortDescription ?? undefined,
    handle: raw.id,
    status: mapStatus(raw),
    vendor: raw.brand ?? undefined,
    productType: raw.primaryCategoryId ?? undefined,
    options: options,
    variants: variants.length > 0 ? variants : undefined,
    images: images,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.lastModified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → SCAPI product update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    longDescription: product.description,
    online:
      product.status === 'ACTIVE'
        ? true
        : product.status === 'ARCHIVED'
          ? false
          : undefined,
    brand: product.vendor,
    primaryCategoryId: product.productType,
  }
}

/** Canonical ProductVariant → SCAPI variant update body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    orderable: true,
    variationValues: variant.optionValues,
  }
}
