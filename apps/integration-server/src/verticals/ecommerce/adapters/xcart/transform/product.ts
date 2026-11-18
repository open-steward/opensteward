/**
 * X-Cart Product → canonical Product.
 *
 * X-Cart exposes a flat product object with images as an array and
 * categories as an array of `{ id, name }`. There is no concept of
 * "variable product" at the top level — each product is a simple SKU.
 * Stock is carried directly on the product as `quantity`.
 *
 * A single synthetic variant is created from the product itself so
 * downstream code can always iterate `product.variants`.
 *
 * All prices arrive as floats (not strings).
 */

import type { Product, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw X-Cart shapes ────────────────────────────────────────────────────────

export interface XCartProductImage {
  id?: number | string
  url?: string
  alt?: string | null
  [key: string]: unknown
}

export interface XCartProductCategory {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export interface XCartProduct {
  id: number | string
  sku?: string | null
  name: string
  description?: string | null
  brief_description?: string | null
  price: number
  sale_price?: number | null
  enabled: boolean
  weight?: number | null
  quantity?: number | null
  images?: XCartProductImage[]
  categories?: XCartProductCategory[]
  tags?: string[]
  vendor?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function transformImage(raw: XCartProductImage): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.url ?? '',
    alt: raw.alt ?? undefined,
  }
}

export function transformProduct(raw: XCartProduct, currency = 'USD'): Product {
  const productId = String(raw.id)
  const images = (raw.images ?? []).map(transformImage)
  const firstCategory =
    raw.categories && raw.categories.length > 0 ? raw.categories[0]!.name : undefined

  // X-Cart has no native variant concept — synthesize one from the product.
  const variant: ProductVariant = {
    id: `${productId}:default`,
    productId,
    sku: raw.sku ?? undefined,
    price: { amount: majorToMinor(raw.price, currency), currency },
    compareAtPrice:
      raw.sale_price != null
        ? { amount: majorToMinor(raw.price, currency), currency }
        : undefined,
    weight: raw.weight != null ? raw.weight : undefined,
    weightUnit: raw.weight != null ? 'kg' : undefined,
    inventoryItemId: productId,
    metadata: {
      synthetic: true,
      reason: 'X-Cart product mapped to single canonical variant',
      parentProductId: productId,
    },
  }

  return {
    id: productId,
    title: raw.name,
    description: raw.description ?? undefined,
    status: raw.enabled ? 'ACTIVE' : 'DRAFT',
    vendor: raw.vendor ?? undefined,
    productType: firstCategory,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    variants: [variant],
    images: images.length > 0 ? images : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → X-Cart product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    enabled: product.status === 'ACTIVE' || product.status == null ? true : false,
    vendor: product.vendor,
  }

  // Flatten price from the first variant (X-Cart has no separate variant resource).
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = v.price.amount / 100
    if (v.compareAtPrice?.amount != null) body['sale_price'] = v.compareAtPrice.amount / 100
    if (v.sku) body['sku'] = v.sku
    if (v.weight != null) body['weight'] = v.weight
  }

  if (product.tags) body['tags'] = product.tags
  if (product.images) {
    body['images'] = product.images.map((i) => ({ url: i.url, alt: i.alt }))
  }
  return body
}
