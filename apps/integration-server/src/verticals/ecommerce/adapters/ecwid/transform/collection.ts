/**
 * Ecwid Category → canonical Collection.
 *
 * Ecwid categories map to the canonical collection type. All categories
 * are manually curated, so we hardcode `type: 'MANUAL'`. Ecwid categories
 * can contain `productIds` when fetched individually.
 *
 * Docs: https://developer.ecwid.com/
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawEcwidCategory {
  id: number | string
  name: string
  url?: string
  parentId?: number | string | null
  description?: string
  enabled?: boolean
  orderBy?: number
  productCount?: number
  productIds?: Array<number | string>
  imageUrl?: string
  originalImageUrl?: string
  hdThumbnailUrl?: string
  thumbnailUrl?: string
  originalImage?: { url?: string; width?: number; height?: number }
  [key: string]: unknown
}

function mapImage(raw: RawEcwidCategory): Image | undefined {
  const url = raw.originalImageUrl ?? raw.imageUrl ?? raw.originalImage?.url
  if (!url) return undefined
  return {
    url,
    width: raw.originalImage?.width,
    height: raw.originalImage?.height,
  }
}

export function transformCollection(raw: RawEcwidCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.url,
    description: raw.description,
    type: 'MANUAL',
    productIds: raw.productIds?.map((p) => String(p)),
    image: mapImage(raw),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    description: collection.description,
  }
  if (collection.image?.url) {
    body['imageUrl'] = collection.image.url
  }
  if (collection.productIds) {
    body['productIds'] = collection.productIds.map(Number)
  }
  return body
}
