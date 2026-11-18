/**
 * Shopify CustomCollection / SmartCollection → canonical Collection.
 *
 * Shopify has two collection endpoints:
 *  - `/custom_collections.json` → manually curated → canonical type `MANUAL`
 *  - `/smart_collections.json`  → rule-based      → canonical type `SMART`
 *
 * The adapter tags the response before handing it here via the `type`
 * parameter.
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawShopifyCollectionImage {
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawShopifyCollection {
  id: number | string
  title: string
  handle?: string
  body_html?: string | null
  published_at?: string | null
  updated_at?: string
  image?: RawShopifyCollectionImage | null
  [key: string]: unknown
}

function mapImage(img: RawShopifyCollectionImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return {
    url: img.src,
    alt: img.alt ?? undefined,
    width: img.width,
    height: img.height,
  }
}

export function transformCollection(
  raw: RawShopifyCollection,
  type: CollectionType = 'MANUAL',
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

/** Canonical Collection → Shopify custom_collection body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
    body_html: collection.description,
    published_at: collection.publishedAt,
    image: collection.image?.url ? { src: collection.image.url, alt: collection.image.alt } : undefined,
  }
}
