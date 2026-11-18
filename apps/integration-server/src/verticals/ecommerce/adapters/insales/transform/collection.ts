/**
 * InSales Collection / Category → canonical Collection.
 *
 * InSales exposes two collection-like resources:
 *   - `/admin/categories.json`   — product categories (tree-based)
 *   - `/admin/collections.json`  — manual curated groups
 *
 * Both share the same response shape here and map to type `MANUAL`
 * (curated by the merchant).
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawInsalesCollectionImage {
  url?: string
  original_url?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawInsalesCollection {
  id: number | string
  title: string
  permalink?: string | null
  description?: string | null
  position?: number
  updated_at?: string
  created_at?: string
  image?: RawInsalesCollectionImage | null
  parent_id?: number | string | null
  [key: string]: unknown
}

function mapImage(img: RawInsalesCollectionImage | null | undefined): Image | undefined {
  if (!img) return undefined
  const url = img.url ?? img.original_url
  if (!url) return undefined
  return {
    url,
    alt: img.alt ?? undefined,
    width: img.width,
    height: img.height,
  }
}

export function transformCollection(
  raw: RawInsalesCollection,
  type: CollectionType = 'MANUAL',
): Collection {
  return {
    id: String(raw.id),
    title: raw.title,
    handle: raw.permalink ?? undefined,
    description: raw.description ?? undefined,
    type,
    image: mapImage(raw.image),
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → InSales collection body. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    title: collection.title,
    permalink: collection.handle,
    description: collection.description,
    image_url: collection.image?.url,
  }
}
