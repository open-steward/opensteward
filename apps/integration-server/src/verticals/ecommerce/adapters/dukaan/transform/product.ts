/**
 * Dukaan product → canonical Product.
 *
 * Two documented shapes, both keyed by the product `uuid` ("Product uuid:
 * Each product will have a uuid, this is required to perform product-related
 * operations ... product uuid would be needed to get product details"):
 *
 *  - a row of product_list, GET /api/seller-front/{store_uuid}/product-list/
 *  - `data` of product_details, GET /api/product/seller/{store_uuid}/product/{product_uuid}/v2/
 *
 * Neither response carries a currency, so no price is mapped: the canonical
 * variant price is Money and requires one. The prices stay in `metadata`.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { toIsoDatetime, toSlug } from '@opensteward/shared'

// ── Raw Dukaan shapes (fields as in the documented example responses) ────────

/** A row of product_list (`pop_fields=variants_data`). */
export interface RawDukaanProductListRow {
  id: number
  uuid: string
  created_at: string
  name: string
  image: string
  in_stock: boolean
  is_active: boolean
  selling_price: number
  original_price: number
  all_images: string[]
  slug: string
  [key: string]: unknown
}

/** `data` of product_details. */
export interface RawDukaanProductDetail {
  id: number
  uuid: string
  slug: string
  is_active: boolean
  name: string
  description: string | null
  selling_price: string
  original_price: string
  all_images: string[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(isActive: boolean | undefined): ProductStatus | undefined {
  if (isActive === true) return 'ACTIVE'
  if (isActive === false) return 'DRAFT'
  return undefined
}

function mapImages(urls: string[] | null | undefined): Image[] | undefined {
  if (!Array.isArray(urls)) return undefined
  const images = urls
    .filter((url) => typeof url === 'string' && url.length > 0)
    .map((url, position) => ({ url, position }))
  return images.length > 0 ? images : undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformProductListRow(raw: RawDukaanProductListRow): Product {
  return {
    id: raw.uuid,
    title: raw.name,
    handle: toSlug(raw.slug),
    status: mapStatus(raw.is_active),
    images: mapImages(raw.all_images),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProductDetail(raw: RawDukaanProductDetail): Product {
  return {
    id: raw.uuid,
    title: raw.name,
    description: raw.description ?? undefined,
    handle: toSlug(raw.slug),
    status: mapStatus(raw.is_active),
    images: mapImages(raw.all_images),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Write-side body for createProduct / updateProduct. Those methods are out of
 * scope for the list rebuild and still target undocumented paths.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    brand: product.vendor,
  }
  if (product.status) {
    body['is_active'] = product.status === 'ACTIVE'
    body['status'] = product.status.toLowerCase()
  }
  if (product.tags) body['tags'] = product.tags
  return body
}
