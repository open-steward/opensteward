/**
 * Dukaan product category → canonical Collection.
 *
 * A row of get_category_list, GET /api/product/seller/product-category/?v2=true.
 * Keyed by the category `uuid` (the "Category uuid" of the collection's
 * Important Keys table, and the path key of update_category).
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Collection } from '../../../schema/collection'
import { toSlug } from '@opensteward/shared'

// ── Raw Dukaan shape (fields as in the documented example response) ──────────

export interface RawDukaanCategory {
  id: number
  uuid: string
  created_at: string
  name: string
  position: number
  image: string | null
  is_active: boolean
  parent_id: number | null
  slug: string
  product_count: number
  web_url: string
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawDukaanCategory): Collection {
  return {
    id: raw.uuid,
    title: raw.name,
    handle: toSlug(raw.slug),
    image: raw.image ? { url: raw.image } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Write-side body for createCollection / updateCollection. Those methods are
 * out of scope for the list rebuild and still target undocumented paths.
 */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
    image: collection.image?.url,
  }
}
