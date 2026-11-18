/**
 * Bumpa Collection (product category/group) → canonical Collection.
 *
 * Bumpa organises products into named groups/categories. The API returns
 * these as collection-like objects with id, name/title, description, and
 * an optional image. All Bumpa collections are manually curated (MANUAL).
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawBumpaCollectionImage {
  url?: string
  image_url?: string
  alt?: string | null
  [key: string]: unknown
}

export interface RawBumpaCollection {
  id: number | string
  name?: string
  title?: string
  slug?: string
  handle?: string
  description?: string | null
  image?: RawBumpaCollectionImage | string | null
  product_ids?: Array<number | string>
  updated_at?: string
  published_at?: string | null
  [key: string]: unknown
}

function mapImage(
  img: RawBumpaCollectionImage | string | null | undefined,
): Image | undefined {
  if (!img) return undefined
  if (typeof img === 'string') {
    return img.length > 0 ? { url: img } : undefined
  }
  const url = img.url ?? img.image_url
  if (!url) return undefined
  return { url, alt: img.alt ?? undefined }
}

export function transformCollection(raw: RawBumpaCollection): Collection {
  return {
    id: String(raw.id),
    title: (raw.name ?? raw.title ?? '') as string,
    handle: raw.slug ?? raw.handle,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: raw.product_ids?.map(String),
    image: mapImage(raw.image),
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Bumpa collection body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
    published_at: collection.publishedAt,
    image: collection.image?.url ?? undefined,
    product_ids: collection.productIds,
  }
}
