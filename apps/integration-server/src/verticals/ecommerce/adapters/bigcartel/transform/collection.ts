/**
 * Big Cartel Category → canonical Collection.
 *
 * Big Cartel categories are simple name-based groupings. They have minimal
 * fields: id, name, permalink, and associated product IDs via relationships.
 *
 * Categories are always manually curated (no smart/rule-based categories),
 * so `type` is hardcoded to `'MANUAL'`.
 *
 * Docs: https://developers.bigcartel.com/
 */

import type { Collection } from '../../../schema/collection'

export interface RawBigCartelCategory {
  id: string | number
  type?: string
  attributes?: {
    name?: string
    permalink?: string
    created_at?: string
    updated_at?: string
  }
  relationships?: {
    products?: {
      data?: Array<{ id: string | number; type?: string }>
    }
  }
  [key: string]: unknown
}

export function transformCollection(raw: RawBigCartelCategory): Collection {
  const attrs = raw.attributes ?? {}
  const productIds =
    raw.relationships?.products?.data?.map((p) => String(p.id)) ?? []

  return {
    id: String(raw.id),
    title: attrs.name ?? '',
    handle: attrs.permalink,
    type: 'MANUAL',
    productIds: productIds.length > 0 ? productIds : [],
    updatedAt: attrs.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (collection.title != null) attributes['name'] = collection.title
  if (collection.handle != null) attributes['permalink'] = collection.handle
  return { data: { type: 'categories', attributes } }
}
