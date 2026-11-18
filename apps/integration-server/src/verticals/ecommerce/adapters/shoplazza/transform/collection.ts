/**
 * Shoplazza Collection → canonical Collection.
 *
 * Shoplazza supports manual and automated (smart) collections under a unified
 * `/openapi/{version}/collections` endpoint. The `collection_type` field
 * distinguishes them: `"custom"` = MANUAL, `"smart"` = SMART.
 *
 * Description lives in the `description` field (not `body_html`).
 *
 * Docs: https://www.shoplazza.dev/reference/api-usage (collections scope)
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawShoplazzaCollectionImage {
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawShoplazzaCollection {
  id: number | string
  title: string
  handle?: string | null
  description?: string | null
  /** "custom" | "smart" — distinguishes collection type. */
  collection_type?: string | null
  /** Whether the collection is published. */
  published?: boolean | null
  published_at?: string | null
  updated_at?: string
  image?: RawShoplazzaCollectionImage | null
  [key: string]: unknown
}

function mapImage(img: RawShoplazzaCollectionImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return {
    url: img.src,
    alt: img.alt ?? undefined,
    width: img.width,
    height: img.height,
  }
}

function mapCollectionType(raw: string | null | undefined): CollectionType {
  if (raw === 'smart') return 'SMART'
  return 'MANUAL'
}

export function transformCollection(raw: RawShoplazzaCollection): Collection {
  return {
    id: String(raw.id),
    title: raw.title,
    handle: raw.handle ?? undefined,
    description: raw.description ?? undefined,
    type: mapCollectionType(raw.collection_type),
    image: mapImage(raw.image),
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Shoplazza collection body (for create/update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    published_at: collection.publishedAt,
    image: collection.image?.url
      ? { src: collection.image.url, alt: collection.image.alt }
      : undefined,
  }
}
