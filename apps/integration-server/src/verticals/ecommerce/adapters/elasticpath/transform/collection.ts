/**
 * Elastic Path Hierarchy → canonical Collection.
 *
 * Elastic Path uses Hierarchies + Nodes for catalog organization.
 * A Hierarchy is the top-level grouping; Nodes are nested within.
 * We map Hierarchy → Collection.
 *
 * Hierarchy shape:
 *   { id, type: 'hierarchy', attributes: { name, description, slug, created_at, updated_at } }
 */

import type { Collection } from '../../../schema/collection'
import { toSlug } from '@opensteward/shared'

export interface RawEpHierarchyAttributes {
  name?: string
  description?: string
  slug?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawEpHierarchy {
  id: string
  type: string
  attributes: RawEpHierarchyAttributes
  relationships?: Record<string, unknown>
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export function transformCollection(raw: RawEpHierarchy): Collection {
  const attrs = raw.attributes
  return {
    id: raw.id,
    title: attrs.name ?? '',
    handle: toSlug(attrs.slug),
    description: attrs.description,
    type: 'MANUAL',
    updatedAt: attrs.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    data: {
      type: 'hierarchy',
      attributes: {
        name: collection.title,
        description: collection.description,
        slug: collection.handle,
      },
    },
  }
}
