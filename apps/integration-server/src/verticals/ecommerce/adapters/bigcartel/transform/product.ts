/**
 * Big Cartel Product → canonical Product / ProductVariant.
 *
 * Big Cartel has a very simple product model:
 *  - Products have a name, description, price, status, images, and categories.
 *  - "Options" are product-level options (e.g. Size, Color) with values.
 *  - There is no separate variant/SKU resource — options are inline on the product.
 *  - Each product option combination is not a discrete variant entity.
 *
 * Because Big Cartel lacks a dedicated variant resource, we synthesize a
 * single "default" variant per product from the product's price to maintain
 * consistency with the canonical schema.
 *
 * Prices are numeric (cents or whole units depending on configuration).
 * Status is a simple string: 'active', 'sold_out', 'hidden'.
 *
 * Docs: https://developers.bigcartel.com/
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Big Cartel shapes ──────────────────────────────────────────────────

export interface RawBigCartelImage {
  url?: string
  width?: number
  height?: number
}

export interface RawBigCartelOption {
  name: string
  values?: string[]
}

export interface RawBigCartelProduct {
  id: string | number
  type?: string
  attributes?: {
    name?: string
    description?: string | null
    permalink?: string
    status?: string
    default_price?: string | number | null
    created_at?: string
    updated_at?: string
    url?: string
    images?: RawBigCartelImage[]
    options?: RawBigCartelOption[]
    position?: number
    categories?: string[]
  }
  relationships?: {
    categories?: {
      data?: Array<{ id: string | number; type?: string }>
    }
  }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  switch (s.toLowerCase()) {
    case 'active':
      return 'ACTIVE'
    case 'hidden':
      return 'DRAFT'
    case 'sold_out':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function reverseStatus(s: ProductStatus | undefined): string | undefined {
  if (!s) return undefined
  switch (s) {
    case 'ACTIVE':
      return 'active'
    case 'DRAFT':
      return 'hidden'
    case 'ARCHIVED':
      return 'sold_out'
    default:
      return undefined
  }
}

function transformImage(raw: RawBigCartelImage, index: number): Image {
  return {
    url: raw.url ?? '',
    width: raw.width,
    height: raw.height,
    position: index,
  }
}

function transformOption(raw: RawBigCartelOption, index: number): ProductOption {
  return {
    name: raw.name,
    values: raw.values ?? [],
    position: index,
  }
}

export function transformProduct(
  raw: RawBigCartelProduct,
  currency: string = 'USD',
): Product {
  const attrs = raw.attributes ?? {}
  const productId = String(raw.id)
  const images = (attrs.images ?? []).map(transformImage)
  const options = (attrs.options ?? []).map(transformOption)

  // Synthesize a single default variant from the product price.
  const variants: ProductVariant[] = [
    {
      id: `${productId}:default`,
      productId,
      price: { amount: majorToMinor(toMoneyAmount(attrs.default_price), currency), currency },
      metadata: {
        synthetic: true,
        reason: 'Big Cartel has no separate variant resource',
        parentProductId: productId,
      },
    },
  ]

  // Category IDs from relationships
  const categoryIds = raw.relationships?.categories?.data?.map((c) => String(c.id))

  return {
    id: productId,
    title: attrs.name ?? '',
    description: attrs.description ?? undefined,
    handle: attrs.permalink,
    status: mapStatus(attrs.status),
    tags: categoryIds && categoryIds.length > 0 ? categoryIds : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Big Cartel product body (for update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (product.title != null) attributes['name'] = product.title
  if (product.description != null) attributes['description'] = product.description
  if (product.handle != null) attributes['permalink'] = product.handle
  if (product.status != null) attributes['status'] = reverseStatus(product.status)
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    // Canonical price is integer minor units; Big Cartel expects a decimal major-unit string.
    if (v.price?.amount != null) attributes['default_price'] = (v.price.amount / 100).toFixed(2)
  }
  if (product.options) {
    attributes['options'] = product.options.map((o) => ({
      name: o.name,
      values: o.values,
    }))
  }
  return { data: { type: 'products', attributes } }
}

/** Canonical ProductVariant → Big Cartel product body (partial, price only). */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (variant.price?.amount != null) {
    // Canonical price is integer minor units; Big Cartel expects a decimal major-unit string.
    attributes['default_price'] = (variant.price.amount / 100).toFixed(2)
  }
  return { data: { type: 'products', attributes } }
}
