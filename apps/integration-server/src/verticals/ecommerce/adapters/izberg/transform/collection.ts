/**
 * IZBERG Category → canonical Collection.
 *
 * IZBERG exposes a hierarchical product taxonomy via the `category` resource.
 * Each category has a name, optional description, parent, and child categories.
 * We map these to the canonical Collection type with type='MANUAL'.
 *
 * Used only by createCollection / updateCollection, which still target
 * /v1/category/, a path in neither first-party spec. listCollections and
 * getCollection refuse with 501 (see index.ts): the documented
 * GET /v1/application_category/ documents no response fields to map from.
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import type { Collection } from '../../../schema/collection'

// ── Raw IZBERG shape ─────────────────────────────────────────────────────────

export interface RawIzbergCategory {
  id: number | string
  resource_uri?: string
  name?: string | null
  description?: string | null
  slug?: string | null
  parent?: number | string | null
  image?: string | null
  is_active?: boolean | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawIzbergCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name ?? String(raw.id),
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    type: 'MANUAL',
    image: raw.image ? { url: raw.image } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → IZBERG category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    slug: collection.handle,
  }
}
