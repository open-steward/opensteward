/**
 * Medusa v2 Collection → canonical Collection.
 *
 * Medusa product collections are MANUAL groupings. They carry a `title`,
 * `handle`, optional `products[]` (when expanded), and timestamps.
 */

import type { Collection } from '../../../schema/collection'

export interface RawMedusaCollection {
  id: string
  title: string
  handle?: string | null
  products?: Array<{ id: string }> | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawMedusaCollection): Collection {
  const productIds = raw.products?.map((p) => p.id)
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle ?? undefined,
    type: 'MANUAL',
    productIds: productIds && productIds.length > 0 ? productIds : undefined,
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
  }
}
