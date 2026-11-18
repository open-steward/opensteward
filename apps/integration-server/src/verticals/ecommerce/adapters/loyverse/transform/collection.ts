/**
 * Loyverse Category → canonical Collection.
 *
 * Loyverse's product-grouping concept is a "category". Each category has:
 *  - `id`: unique identifier
 *  - `name`: display name
 *  - `color`: hex color used for POS display
 *  - `created_at`, `deleted_at`
 *
 * Categories are manually curated (no dynamic rules), so we map them as type
 * `MANUAL`. Product-to-category associations are stored on the item via
 * `category_id`, so `productIds` is not available from the category endpoint
 * alone and is omitted.
 */

import type { Collection } from '../../../schema/collection'

export interface RawLoyverseCategory {
  id: string
  name: string
  color?: string | null
  created_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

export function transformCollection(raw: RawLoyverseCategory): Collection {
  return {
    id: raw.id,
    title: raw.name,
    type: 'MANUAL',
    updatedAt: raw.created_at,
    publishedAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Loyverse category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
  }
}
