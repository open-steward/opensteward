/**
 * Haravan CustomCollection / SmartCollection → canonical Collection.
 *
 * Haravan mirrors Shopify's split exactly: `/custom_collections.json`
 * (manually curated, canonical `MANUAL`) and `/smart_collections.json`
 * (rule-based, canonical `SMART`), with the same field names on both.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/custom-collections/,
 *       https://docs.haravan.com/docs/omni-apis/smart-collections/
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawHaravanCollectionImage {
  src?: string
  width?: number
  height?: number
}

export interface RawHaravanCollection {
  id: number | string
  title: string
  handle?: string
  body_html?: string | null
  published_at?: string | null
  updated_at?: string
  image?: RawHaravanCollectionImage | null
  [key: string]: unknown
}

function mapImage(img: RawHaravanCollectionImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return { url: img.src, width: img.width, height: img.height }
}

export function transformCollection(
  raw: RawHaravanCollection,
  type: CollectionType,
): Collection {
  return {
    id: String(raw.id),
    title: raw.title,
    handle: raw.handle,
    description: raw.body_html ?? undefined,
    type,
    image: mapImage(raw.image),
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Haravan custom_collection body (only MANUAL collections are creatable). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
    body_html: collection.description,
    image: collection.image?.url ? { src: collection.image.url } : undefined,
  }
}
