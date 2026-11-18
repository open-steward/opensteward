/**
 * SHOPLINE Collection → canonical Collection.
 *
 * SHOPLINE exposes a single `/products/collections/:id.json` GET endpoint and
 * a `/products/smart_collections.json` POST endpoint. Both manual and smart
 * collections share the same response shape. The `collection_type` field
 * distinguishes them at runtime.
 *
 * Docs:
 *   https://developer.shopline.com/docs/admin-rest-api/product/collection/query-collection-information-by-id/
 *   https://developer.shopline.com/docs/admin-rest-api/product/collection/create-smart-collection/
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawShoplineCollectionImage {
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawShoplineCollection {
  id: number | string
  title: string
  handle?: string
  body_html?: string | null
  collection_type?: string // 'manual' | 'smart'
  published_at?: string | null
  updated_at?: string
  created_at?: string
  image?: RawShoplineCollectionImage | null
  banner?: RawShoplineCollectionImage | null
  sort_order?: string
  disjunctive?: boolean
  rules?: unknown[]
  [key: string]: unknown
}

function mapImage(img: RawShoplineCollectionImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return {
    url: img.src,
    alt: img.alt ?? undefined,
    width: img.width,
    height: img.height,
  }
}

function mapType(raw: RawShoplineCollection, hint?: CollectionType): CollectionType {
  if (hint) return hint
  const ct = raw.collection_type?.toLowerCase()
  if (ct === 'smart') return 'SMART'
  // Collections with rules are smart; otherwise manual.
  if (raw.rules && (raw.rules as unknown[]).length > 0) return 'SMART'
  return 'MANUAL'
}

export function transformCollection(
  raw: RawShoplineCollection,
  typeHint?: CollectionType,
): Collection {
  // Prefer `image`, fall back to `banner` (SHOPLINE uses both interchangeably)
  const image = mapImage(raw.image) ?? mapImage(raw.banner)
  return {
    id: String(raw.id),
    title: raw.title,
    handle: raw.handle,
    description: raw.body_html ?? undefined,
    type: mapType(raw, typeHint),
    image,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → SHOPLINE collection body (for create/update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
    body_html: collection.description,
    published_at: collection.publishedAt,
    image: collection.image?.url
      ? { src: collection.image.url, alt: collection.image.alt }
      : undefined,
  }
}
