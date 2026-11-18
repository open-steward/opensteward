/**
 * Webflow CMS Collection → canonical Collection.
 *
 * Webflow's CMS is the backbone of its data model. CMS Collections are
 * analogous to product categories / collections in other platforms.
 *
 * Docs: https://developers.webflow.com/data/reference/cms/collections
 */

import type { Collection, CollectionType } from '../../../schema/collection'

export interface RawWebflowCollection {
  id: string
  displayName?: string
  singularName?: string
  slug?: string
  createdOn?: string
  lastUpdated?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawWebflowCollection): Collection {
  return {
    id: raw.id,
    title: raw.displayName ?? raw.singularName ?? '',
    handle: raw.slug,
    type: 'MANUAL' as CollectionType,
    updatedAt: raw.lastUpdated,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Webflow collection body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    displayName: collection.title,
    singularName: collection.title,
    slug: collection.handle,
  }
}
