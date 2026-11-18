/**
 * Sapo CustomCollection / SmartCollection → canonical Collection.
 *
 * Sapo has two collection endpoints:
 *  - `/admin/custom_collections.json` → manually curated → canonical type `MANUAL`
 *  - `/admin/smart_collections.json`  → rule-based      → canonical type `SMART`
 *
 * Sapo collection field names differ from Shopify:
 *  - `name`        (Shopify: `title`)
 *  - `alias`       (Shopify: `handle`)
 *  - `description` (Shopify: `body_html`) — already plain/HTML, no renaming needed
 *  - `modified_on` (Shopify: `updated_at`)
 *  - `published_on` (Shopify: `published_at`)
 *
 * Docs: https://support.sapo.vn/customcollection
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawSapoCollectionImage {
  id?: number | string
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawSapoCollection {
  id: number | string
  /** Collection title — Sapo uses `name`. */
  name: string
  /** URL slug — Sapo uses `alias`. */
  alias?: string
  /** HTML description — Sapo field is already called `description`. */
  description?: string | null
  published_on?: string | null
  modified_on?: string
  image?: RawSapoCollectionImage | null
  products_count?: number
  sort_order?: string
  [key: string]: unknown
}

function mapImage(img: RawSapoCollectionImage | null | undefined): Image | undefined {
  if (!img || !img.src) return undefined
  return {
    id: img.id != null ? String(img.id) : undefined,
    url: img.src,
    alt: img.alt ?? undefined,
    width: img.width,
    height: img.height,
  }
}

export function transformCollection(
  raw: RawSapoCollection,
  type: CollectionType = 'MANUAL',
): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.alias,
    description: raw.description ?? undefined,
    type,
    image: mapImage(raw.image),
    updatedAt: raw.modified_on,
    publishedAt: raw.published_on ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Sapo custom_collection body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    alias: collection.handle,
    description: collection.description,
    published_on: collection.publishedAt,
    image:
      collection.image?.url
        ? { src: collection.image.url, alt: collection.image.alt }
        : undefined,
  }
}
