/**
 * SendOwl Product → canonical Product.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/products
 *
 * SendOwl products are single-SKU digital goods (bundles, which group
 * multiple products, are a separate resource — not a product variant).
 * There is no independent variant endpoint, so — following the existing
 * Gumroad adapter's precedent for the same shape
 * (`../gumroad/transform/product.ts`) — canonical `Product.variants` is left
 * undefined rather than synthesizing a fake single variant. The raw price
 * stays reachable via `metadata` for callers that need it.
 */
import type { Product } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

export interface RawSendOwlProduct {
  id: number | string
  name: string
  product_type?: string
  category?: string
  subcategory?: string
  /** Decimal — SendOwl's docs show this as both a bare number and a string
   *  across different reference pages; accept either. */
  price?: number | string
  currency_code?: string
  override_currency_code?: string
  product_image_url?: string
  sales_page_url?: string
  weight?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function extractImages(raw: RawSendOwlProduct): Image[] | undefined {
  if (!raw.product_image_url) return undefined
  return [{ url: raw.product_image_url, position: 0 }]
}

export function transformProduct(raw: RawSendOwlProduct): Product {
  return {
    id: String(raw.id),
    title: raw.name,
    productType: raw.product_type,
    images: extractImages(raw),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: { ...raw },
  }
}

/**
 * Canonical Product → SendOwl product create/update body.
 *
 * `price` and `currency_code` have no canonical `Product`-level home (see
 * header comment) so they round-trip through `metadata`, mirroring Gumroad's
 * `untransformProduct`.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title != null) body['name'] = product.title
  if (product.productType != null) body['product_type'] = product.productType

  const meta = product.metadata ?? {}
  if (meta['price'] != null) body['price'] = meta['price']
  if (meta['currency_code'] != null) body['currency_code'] = meta['currency_code']
  if (meta['category'] != null) body['category'] = meta['category']
  if (meta['subcategory'] != null) body['subcategory'] = meta['subcategory']

  return body
}
