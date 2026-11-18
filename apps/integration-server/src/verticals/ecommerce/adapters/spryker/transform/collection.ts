/**
 * Spryker category-nodes → canonical Collection.
 *
 * Spryker Glue REST API: GET /category-nodes, GET /category-nodes/{id}
 *   Response type: "category-nodes"
 *
 * Key attribute fields: name, metaTitle, metaDescription, metaKeywords,
 *   isActive, order (sort order), nodeId, parents[], children[],
 *   url.
 *
 * Spryker category nodes form a tree; we map each node to a canonical
 * Collection with type MANUAL (Spryker categories are manually maintained).
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { JsonApiResource } from '../client'

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerCategoryNodeAttributes {
  nodeId?: number | string | null
  name?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  metaKeywords?: string | null
  isActive?: boolean
  order?: number | null
  url?: string | null
  children?: Array<{ nodeId?: number | string; name?: string }>
  parents?: Array<{ nodeId?: number | string; name?: string }>
  [key: string]: unknown
}

export type RawSprykerCategoryNode = JsonApiResource<RawSprykerCategoryNodeAttributes>

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCategoryNode(raw: RawSprykerCategoryNode): Collection {
  const attrs = raw.attributes
  return {
    id: raw.id,
    title: attrs.name ?? raw.id,
    handle: attrs.url ?? undefined,
    description: attrs.metaDescription ?? undefined,
    type: 'MANUAL' as CollectionType,
    updatedAt: undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Spryker category create/update body. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    data: {
      type: 'category-nodes',
      attributes: {
        name: collection.title,
        metaDescription: collection.description,
        isActive: true,
      },
    },
  }
}
