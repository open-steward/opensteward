/**
 * Bagy Category → canonical Collection.
 *
 * Bagy calls them "categories" but they map cleanly to the canonical
 * Collection resource. All Bagy categories are manually curated, so
 * we always emit type `MANUAL`.
 *
 * Key Bagy fields:
 *  - `id` — category ID
 *  - `name` — display title
 *  - `description` — HTML description
 *  - `slug` — URL handle
 *  - `modified` / `created` — timestamps
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Bagy shape ───────────────────────────────────────────────────────────

export interface RawBagyCategory {
  id: number | string
  name: string
  description?: string | null
  slug?: string | null
  order?: number | string | null
  modified?: string | null
  created?: string | null
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCollection(raw: RawBagyCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: undefined,
    updatedAt: toIsoDatetime(raw.modified),
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Bagy category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    slug: collection.handle,
  }
}
