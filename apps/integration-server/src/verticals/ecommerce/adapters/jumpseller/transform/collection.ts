/**
 * Jumpseller Category → canonical Collection.
 *
 * Jumpseller uses "categories" rather than "collections". They are manually
 * curated groupings of products, so we map them to CollectionType `MANUAL`.
 *
 * API:
 *  - GET  /categories.json          → array of category objects
 *  - GET  /categories/{id}.json     → single category
 *  - POST /categories.json          → create category
 *  - PUT  /categories/{id}.json     → update category
 *  - DELETE /categories/{id}.json   → delete category
 *
 * Docs: https://jumpseller.com/support/api/
 */

import type { Collection } from '../../../schema/collection'

export interface RawJumpsellerCategory {
  id: number | string
  name: string
  permalink?: string | null
  description?: string | null
  parent_id?: number | string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawJumpsellerCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.permalink ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Jumpseller category body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    permalink: collection.handle,
    description: collection.description,
  }
}
