/**
 * Mercado Libre Category → canonical Collection.
 *
 * Mercado Libre does not have seller-managed collections. Instead it exposes a
 * platform-managed taxonomy of categories accessible via:
 *   GET /categories/{categoryId}        → get single category
 *   GET /categories/{categoryId}/children_categories → not a real endpoint;
 *       children are embedded in the parent GET response.
 *
 * For listing we use the site's top-level category tree:
 *   GET /sites/{siteId}/categories      → array of { id, name } roots
 *
 * Sellers assign items to categories but cannot create/edit them.
 * Canonical `Collection.id` = ML category id (e.g. "MLA1459").
 * Canonical `Collection.type` = 'SMART' (platform-managed hierarchy).
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliCategoryRef {
  id: string
  name: string
  total_items_in_this_category?: number
}

export interface RawMeliCategory {
  id: string
  name: string
  picture?: string | null
  permalink?: string | null
  total_items_in_this_category?: number
  path_from_root?: RawMeliCategoryRef[]
  children_categories?: RawMeliCategoryRef[]
  date_created?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawMeliCategory): Collection {
  return {
    id: raw.id,
    title: raw.name,
    handle: undefined,
    description: undefined,
    type: 'SMART',
    productIds: undefined,
    image: raw.picture
      ? { url: raw.picture }
      : undefined,
    updatedAt: raw.date_created ? toIsoDatetime(raw.date_created) : undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
