/**
 * JTL-Shop Category (Kategorie) → canonical Collection.
 *
 * JTL-Shop organises products into categories, available under
 * `/api/v1/categories`. Each category has:
 *  - `id`, `name`, `description`, `urlPath` (SEO slug)
 *  - `parentId` (null for root categories)
 *  - `image` object with `url` + optional `alt`
 *  - `active` boolean
 *  - `modified` — ISO 8601 timestamp
 *
 * JTL categories are always "manual" (no rule-based smart collections).
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopCategoryImage {
  url?: string | null
  alt?: string | null
}

export interface RawJtlShopCategory {
  id: number | string
  name?: string
  description?: string | null
  urlPath?: string | null
  parentId?: number | string | null
  active?: boolean
  image?: RawJtlShopCategoryImage | null
  modified?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapImage(img: RawJtlShopCategoryImage | null | undefined): Image | undefined {
  if (!img || !img.url) return undefined
  return {
    url: img.url,
    alt: img.alt ?? undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawJtlShopCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    handle: raw.urlPath ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.image),
    updatedAt: raw.modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → JTL-Shop category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    urlPath: collection.handle,
    image: collection.image?.url ? { url: collection.image.url, alt: collection.image.alt } : undefined,
  }
}
