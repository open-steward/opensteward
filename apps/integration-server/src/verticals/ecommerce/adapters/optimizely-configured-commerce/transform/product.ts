/**
 * Maps Optimizely Configured Commerce's `ProductDto` (Storefront API v1,
 * `GET /api/v1/products` / `/api/v1/products/{id}`) to the canonical
 * Product shape. Confirmed fields: `id`, `name`, `shortDescription`,
 * `erpNumber`. The full ProductDto carries 50+ additional fields (pricing,
 * inventory, images, …) not enumerated in the published reference; those are
 * preserved verbatim in `metadata` but not individually mapped.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/productsv1_getcollectionasync
 *       https://docs.developers.optimizely.com/configured-commerce/reference/productsv1_getasync
 */
import { toSlug } from '@opensteward/shared'
import type { Product } from '../../../schema/product'

export interface RawOptimizelyProduct {
  id: string
  name?: string | null
  shortDescription?: string | null
  erpNumber?: string | null
  [key: string]: unknown
}

export function transformProduct(raw: RawOptimizelyProduct): Product {
  return {
    id: raw.id,
    title: raw.name?.trim() || raw.erpNumber?.trim() || raw.id,
    description: raw.shortDescription ?? undefined,
    handle: toSlug(raw.erpNumber ?? raw.name ?? undefined),
    metadata: raw as Record<string, unknown>,
  }
}
