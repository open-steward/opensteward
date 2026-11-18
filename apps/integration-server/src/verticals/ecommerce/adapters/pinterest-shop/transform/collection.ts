/**
 * Pinterest Product Group → canonical Collection.
 *
 * Pinterest product groups are subsets of a catalog feed defined by
 * filter rules. They serve as the closest analogue to "collections".
 *
 * Key mapping:
 *  - `id` → canonical `id`
 *  - `name` → canonical `title`
 *  - `description` → canonical `description`
 *  - `catalog_type` → tag
 *  - `filters` → stored in metadata
 *  - `status` → used to derive collection type
 *  - `created_at` / `updated_at` → timestamps
 *
 * Product groups are managed via the Catalogs API and are read-only
 * from the adapter perspective (the feed configuration defines them).
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawPinterestProductGroup {
  id: string
  name?: string
  description?: string
  catalog_type?: string
  status?: string
  filters?: Record<string, unknown>
  feed_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Pinterest Product Group → canonical Collection.
 */
export function transformCollection(raw: RawPinterestProductGroup): Collection {
  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }

  return {
    id: raw.id,
    title: raw.name ?? raw.id,
    description: raw.description ?? undefined,
    // Product groups are always filter-based (SMART)
    type: 'SMART',
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata,
  }
}
