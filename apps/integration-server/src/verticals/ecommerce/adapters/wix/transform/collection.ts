/**
 * Wix Collection → canonical Collection.
 *
 * Wix calls these "Collections" in the Stores API. They live under
 * `/stores/v1/collections`.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawWixCollectionMedia {
  url?: string
  fullUrl?: string
  altText?: string | null
  width?: number
  height?: number
}

export interface RawWixCollection {
  id?: string
  name?: string
  slug?: string
  description?: string | null
  visible?: boolean
  media?: {
    mainMedia?: RawWixCollectionMedia
    items?: RawWixCollectionMedia[]
  }
  numberOfProducts?: number
  createdDate?: string
  updatedDate?: string
  [key: string]: unknown
}

function mapImage(raw: RawWixCollectionMedia | null | undefined): Image | undefined {
  if (!raw) return undefined
  const url = raw.fullUrl ?? raw.url
  if (!url) return undefined
  return {
    url,
    alt: raw.altText ?? undefined,
    width: raw.width,
    height: raw.height,
  }
}

export function transformCollection(raw: RawWixCollection): Collection {
  return {
    id: raw.id ?? '',
    title: raw.name ?? '',
    handle: raw.slug,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.media?.mainMedia),
    updatedAt: raw.updatedDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Wix collection body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
  }
}
