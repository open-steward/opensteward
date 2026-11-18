/**
 * Square Catalog CATEGORY → canonical Collection.
 *
 * Categories are catalog objects with type=CATEGORY in Square's polymorphic
 * Catalog API.
 */

import type { Collection } from '../../../schema/collection'

export interface RawSquareCategory {
  id: string
  type: string
  category_data?: {
    name?: string
  }
  version?: number
  updated_at?: string
  is_deleted?: boolean
  [key: string]: unknown
}

export function transformCollection(raw: RawSquareCategory): Collection {
  return {
    id: raw.id,
    title: raw.category_data?.name ?? '',
    type: 'MANUAL',
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Square catalog object body for upsert. */
export function untransformCollection(
  collection: Partial<Collection>,
  version?: number,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    type: 'CATEGORY',
    id: collection.id ?? '#new-category',
    category_data: {
      name: collection.title,
    },
  }
  if (version != null) obj['version'] = version
  return obj
}
