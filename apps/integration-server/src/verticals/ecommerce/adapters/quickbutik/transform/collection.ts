/**
 * Quickbutik Category → canonical Collection.
 *
 * Quickbutik's categories are hierarchical (parent_id / category_id) and map
 * directly to the canonical Collection shape. All Quickbutik categories are
 * manually curated, so `type` is always `MANUAL`.
 *
 * Categories don't inline member product ids — products reference their
 * category, not vice versa — so `productIds` is left empty.
 */

import type { Collection } from '../../../schema/collection'

// ── Raw Quickbutik shape ──────────────────────────────────────────────────────

export interface RawQuickbutikCategory {
  category_id: number | string
  name: string
  uri?: string | null
  url?: string | null
  name_path?: string | null
  description1?: string | null
  description2?: string | null
  parent_id?: number | string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawQuickbutikCategory): Collection {
  const description =
    [raw.description1, raw.description2]
      .filter((d): d is string => typeof d === 'string' && d.length > 0)
      .join('\n') || undefined

  return {
    id: String(raw.category_id),
    title: raw.name,
    handle: raw.uri ?? undefined,
    description,
    type: 'MANUAL',
    productIds: [],
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Collection → Quickbutik category body (for create). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    uri: collection.handle,
    description1: collection.description,
  }
}
