/**
 * Allegro Category → canonical Collection.
 *
 * Allegro has a hierarchical category tree. We map categories to the
 * canonical Collection type since they serve a similar organizational
 * purpose (grouping products). Categories in Allegro are read-only —
 * they are platform-managed.
 *
 * API: GET /sale/categories, GET /sale/categories/{categoryId}
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroCategory {
  id: string
  name?: string
  parent?: {
    id?: string
  }
  leaf?: boolean
  options?: {
    advertisement?: boolean
    advertisementPriceOptional?: boolean
    variantsByColorPatternAllowed?: boolean
    offersWithProductPublicationEnabled?: boolean
    productCreationEnabled?: boolean
  }
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCategory(raw: RawAllegroCategory): Collection {
  return {
    id: raw.id,
    title: raw.name ?? raw.id,
    description: raw.parent?.id ? `Parent category: ${raw.parent.id}` : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
