/**
 * Crystallize Topic / Folder -> canonical Collection.
 *
 * Crystallize uses "topics" for tag-based grouping and "folders" for
 * hierarchical navigation. We map topics to collections since they are
 * the closest analog to a flat product group.
 */

import type { Collection } from '../../../schema/collection'
import { toSlug } from '@opensteward/shared'

export interface RawCrystallizeTopic {
  id: string
  name: string
  path?: string | null
  items?: { edges?: Array<{ node?: { id: string } }> } | null
  /** Resolved product IDs (flattened by adapter). */
  productIds?: string[]
  parentId?: string | null
  children?: Array<{ id?: string; name?: string }> | null
  [key: string]: unknown
}

export function transformCollection(raw: RawCrystallizeTopic): Collection {
  const productIds = raw.productIds
    ?? raw.items?.edges
      ?.map((e) => e.node?.id)
      .filter((id): id is string => !!id)

  return {
    id: raw.id,
    title: raw.name,
    handle: toSlug(raw.path),
    type: 'MANUAL',
    productIds: productIds && productIds.length > 0 ? productIds : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    path: collection.handle,
  }
}
