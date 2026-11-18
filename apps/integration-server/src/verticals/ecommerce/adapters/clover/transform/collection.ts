/**
 * Clover Category → canonical Collection.
 *
 * Clover categories are simple containers for items.
 */

import type { Collection } from '../../../schema/collection'

export interface RawCloverCategory {
  id: string
  name?: string
  sortOrder?: number
  modifiedTime?: number
  items?: { elements?: Array<{ id?: string }> }
  [key: string]: unknown
}

export function transformCollection(raw: RawCloverCategory): Collection {
  const productIds = (raw.items?.elements ?? [])
    .filter((i) => i.id)
    .map((i) => i.id!)

  return {
    id: raw.id,
    title: raw.name ?? '',
    type: 'MANUAL',
    productIds: productIds.length > 0 ? productIds : undefined,
    updatedAt: raw.modifiedTime ? new Date(raw.modifiedTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Clover category body for create/update. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
  }
}
