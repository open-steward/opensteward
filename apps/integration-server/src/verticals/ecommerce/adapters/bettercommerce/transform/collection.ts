/**
 * BetterCommerce Category/Collection → canonical Collection.
 *
 * BetterCommerce refers to product groupings as "categories" at the API level
 * (`/api/v2/catalog/category`). We surface these as canonical Collections.
 *
 * Field mapping:
 *  recordId / categoryId  → id
 *  name                   → title
 *  slug                   → handle
 *  description            → description
 *  image                  → image
 *  parentId               → metadata
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawBCCategory {
  recordId?: string
  categoryId?: string
  name?: string
  slug?: string
  description?: string | null
  image?: string | null
  imageAlt?: string | null
  parentId?: string | null
  displayOrder?: number
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
  publishedAt?: string | null
  [key: string]: unknown
}

function mapImage(raw: RawBCCategory): Image | undefined {
  if (!raw.image) return undefined
  return {
    url: raw.image,
    alt: raw.imageAlt ?? undefined,
  }
}

export function transformCollection(raw: RawBCCategory): Collection {
  return {
    id: raw.recordId ?? raw.categoryId ?? '',
    title: raw.name ?? '',
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw),
    updatedAt: raw.updatedAt,
    publishedAt: raw.publishedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → BetterCommerce category body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
    image: collection.image?.url,
    imageAlt: collection.image?.alt,
  }
}
