/**
 * Yo!Kart Category → canonical Collection.
 *
 * Yo!Kart organises products into a category hierarchy (prodcat). Categories
 * are manually curated (no smart/rules-based categories), so we always set
 * `type: 'MANUAL'`.
 *
 * The category listing API (`/categories/listing`) returns flat objects with
 * an id, name, and image URL. Categories do not inline their member product
 * ids, so `productIds` stays empty. Callers that need membership should list
 * products filtered by `prodcat_id`.
 *
 * Yo!Kart category API paths:
 *   GET /categories/listing      → paginated list (data.categories[])
 *   GET /categories/view/{id}    → single category detail
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartCategory {
  prodcat_id: number | string
  prodcat_name: string
  prodcat_slug?: string
  prodcat_image?: string | null
  prodcat_description?: string
  prodcat_parent?: number | string | null
  prodcat_level?: number | string
  prodcat_order?: number | string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapImage(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  return { url }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawYokartCategory): Collection {
  return {
    id: String(raw.prodcat_id),
    title: raw.prodcat_name,
    handle: raw.prodcat_slug,
    description: raw.prodcat_description || undefined,
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.prodcat_image),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    prodcat_name: collection.title,
    prodcat_slug: collection.handle,
    prodcat_description: collection.description,
    prodcat_image: collection.image?.url,
  }
}
