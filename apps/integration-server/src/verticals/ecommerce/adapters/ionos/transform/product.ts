/**
 * IONOS Product → canonical Product / ProductVariant.
 *
 * IONOS exposes a basic product catalogue through its ecommerce API:
 *  - Products have a name, description, price, SKU, status, and images.
 *  - Variants (options/combinations) may be represented as child "variants"
 *    on the product, or the product itself may be a flat listing.
 *  - Images are a simple URL array.
 *
 * Because IONOS has a limited API surface, we synthesise a default variant
 * from the top-level product price when no explicit variants are present.
 *
 * Docs: https://developer.hosting.ionos.com/
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw IONOS shapes ──────────────────────────────────────────────────────────

export interface RawIonosImage {
  url?: string
  alt?: string
  width?: number
  height?: number
  position?: number
  [key: string]: unknown
}

export interface RawIonosVariantOption {
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawIonosVariant {
  id?: string | number
  sku?: string
  barcode?: string
  price?: number | string | null
  compareAtPrice?: number | string | null
  weight?: number | null
  weightUnit?: string | null
  stock?: number | null
  options?: RawIonosVariantOption[]
  [key: string]: unknown
}

export interface RawIonosProduct {
  id: string | number
  name?: string
  title?: string
  description?: string | null
  slug?: string
  handle?: string
  status?: string
  active?: boolean
  sku?: string
  price?: number | string | null
  compareAtPrice?: number | string | null
  currency?: string
  weight?: number | null
  weightUnit?: string | null
  images?: RawIonosImage[]
  variants?: RawIonosVariant[]
  options?: Array<{ name?: string; values?: string[] }>
  tags?: string[]
  productType?: string
  vendor?: string
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMoneyAmount(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(raw: RawIonosProduct): ProductStatus | undefined {
  if (raw.status != null) {
    switch (String(raw.status).toLowerCase()) {
      case 'active':
      case 'published':
        return 'ACTIVE'
      case 'draft':
      case 'inactive':
        return 'DRAFT'
      case 'archived':
      case 'deleted':
        return 'ARCHIVED'
      default:
        return undefined
    }
  }
  if (raw.active === true) return 'ACTIVE'
  if (raw.active === false) return 'DRAFT'
  return undefined
}

function transformImage(raw: RawIonosImage, index: number): Image {
  return {
    url: raw.url ?? '',
    alt: raw.alt,
    width: raw.width,
    height: raw.height,
    position: raw.position ?? index,
  }
}

function transformVariant(
  raw: RawIonosVariant,
  productId: string,
  currency: string,
  index: number,
): ProductVariant {
  // Build optionValues map from variant options array
  const optionValues: Record<string, string> = {}
  if (raw.options && raw.options.length > 0) {
    for (const opt of raw.options) {
      if (opt.name && opt.value) {
        optionValues[opt.name] = opt.value
      }
    }
  }

  return {
    id: raw.id != null ? String(raw.id) : `${productId}:variant:${index}`,
    productId,
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    price: { amount: majorToMinor(toMoneyAmount(raw.price), currency), currency },
    compareAtPrice:
      raw.compareAtPrice != null
        ? { amount: majorToMinor(toMoneyAmount(raw.compareAtPrice), currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit:
      raw.weightUnit != null
        ? (raw.weightUnit as 'g' | 'kg' | 'oz' | 'lb')
        : undefined,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    position: index,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function buildOptions(
  raw: RawIonosProduct,
): ProductOption[] | undefined {
  if (raw.options && raw.options.length > 0) {
    return raw.options.map((o, i) => ({
      name: o.name ?? `Option ${i + 1}`,
      values: o.values ?? [],
      position: i,
    }))
  }
  return undefined
}

export function transformProduct(
  raw: RawIonosProduct,
  currency: string = 'EUR',
): Product {
  const productId = String(raw.id)
  const resolvedCurrency = raw.currency ?? currency

  const images = (raw.images ?? []).map((img, i) => transformImage(img, i))
  const options = buildOptions(raw)

  let variants: ProductVariant[]
  if (raw.variants && raw.variants.length > 0) {
    variants = raw.variants.map((v, i) =>
      transformVariant(v, productId, resolvedCurrency, i),
    )
  } else {
    // Synthesise a single default variant from the top-level product price.
    variants = [
      {
        id: `${productId}:default`,
        productId,
        sku: raw.sku ?? undefined,
        price: { amount: majorToMinor(toMoneyAmount(raw.price), resolvedCurrency), currency: resolvedCurrency },
        compareAtPrice:
          raw.compareAtPrice != null
            ? { amount: majorToMinor(toMoneyAmount(raw.compareAtPrice), resolvedCurrency), currency: resolvedCurrency }
            : undefined,
        weight: raw.weight ?? undefined,
        weightUnit:
          raw.weightUnit != null
            ? (raw.weightUnit as 'g' | 'kg' | 'oz' | 'lb')
            : undefined,
        metadata: {
          synthetic: true,
          reason: 'IONOS product has no separate variant resource',
          parentProductId: productId,
        },
      },
    ]
  }

  return {
    id: productId,
    title: raw.title ?? raw.name ?? '',
    description: raw.description ?? undefined,
    handle: raw.slug ?? raw.handle ?? undefined,
    status: mapStatus(raw),
    vendor: raw.vendor ?? undefined,
    productType: raw.productType ?? undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    options: options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    publishedAt: raw.publishedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
