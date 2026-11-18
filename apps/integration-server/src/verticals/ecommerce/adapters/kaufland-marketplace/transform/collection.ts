/**
 * Kaufland Marketplace Category → canonical Collection.
 *
 * Kaufland organises its catalog into a hierarchical category tree. Categories
 * are read-only from the seller's perspective — sellers cannot create or
 * modify them; they only assign their products to existing categories.
 *
 * GET /categories returns the category tree. Each node has an id, name, and
 * optional parent_id for hierarchy. We map each category to the canonical
 * Collection type with type = 'MANUAL' (Kaufland categories are editorially
 * curated).
 *
 * Write operations (createCollection, updateCollection, deleteCollection) are
 * not supported and will auto-501 via the adapter registry.
 *
 * Docs: https://sellerapi.kaufland.com/?page=endpoints (categories section)
 */

import type { Collection } from '../../../schema/collection'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

export interface RawKauflandCategory {
  id_category: number | string
  /** Category display name. */
  name?: string | null
  /** Parent category id (absent for root categories). */
  id_parent_category?: number | string | null
  /** Child categories (if embedded). */
  children?: RawKauflandCategory[]
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCollection(raw: RawKauflandCategory): Collection {
  return {
    id: String(raw.id_category),
    title: raw.name ?? `Category ${raw.id_category}`,
    // Kaufland categories don't have URL slugs.
    handle: undefined,
    description: undefined,
    type: 'MANUAL',
    image: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
