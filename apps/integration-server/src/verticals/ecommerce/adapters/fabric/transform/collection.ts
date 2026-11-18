/**
 * fabric Category → canonical Collection.
 *
 * fabric uses categories for product organization: `GET /v3/categories`.
 * Each category has `name`, `description`, `slug`, `parent_id`, `position`,
 * `product_ids`, and optional `image`.
 */

import type { Collection } from '../../../schema/collection'

export interface RawFabricCategory {
  id: string
  name?: string
  description?: string
  slug?: string
  parent_id?: string
  position?: number
  product_ids?: string[]
  image?: {
    id?: string
    url?: string
    alt_text?: string
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
  published_at?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawFabricCategory): Collection {
  return {
    id: raw.id,
    title: raw.name ?? '',
    handle: raw.slug,
    description: raw.description,
    type: 'MANUAL',
    productIds: raw.product_ids,
    image: raw.image?.url
      ? {
          id: raw.image.id,
          url: raw.image.url,
          alt: raw.image.alt_text,
        }
      : undefined,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    slug: collection.handle,
    product_ids: collection.productIds,
  }
}
