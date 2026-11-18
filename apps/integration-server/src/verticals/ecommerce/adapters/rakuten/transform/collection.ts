/**
 * Rakuten RMS CategoryAPI 2.0 shop category → canonical Collection.
 *
 * Rakuten sellers organise their products into seller-defined categories
 * (shop categories), managed through the CategoryAPI 2.0. Each category
 * belongs to a category set (`categorySetId`).
 *
 * Key fields:
 *   - `categoryId`   — unique category identifier (string)
 *   - `title`        — category display name
 *   - `description`  — category description object (HTML text)
 *   - `categorySetId`— the parent category set this category belongs to
 *   - `created`      — ISO datetime string of creation
 *   - `updated`      — ISO datetime string of last update
 *
 * Docs (RMS API list):
 *   https://webservice.rms.rakuten.co.jp/merchant-portal/view?contents=/en/web-service/api-list
 * Source (open-source .NET client):
 *   https://github.com/JakeJP/Rakuten.RMS.Api
 *
 * Endpoints used:
 *   GET https://api.rms.rakuten.co.jp/es/2.0/categories/shop-category-set-lists
 *       → { categorySets: [{ categorySetId, title, created, updated }] }
 *   GET https://api.rms.rakuten.co.jp/es/2.0/categories/shop-categories/category-ids/{categoryId}
 *       → { categoryId, title, categorySetId, description, created, updated }
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RakutenCategoryDescription {
  text?: string
  [key: string]: unknown
}

/** A shop category returned by the Rakuten RMS CategoryAPI 2.0. */
export interface RakutenCategory {
  categoryId: string
  title?: string
  categorySetId?: string
  description?: RakutenCategoryDescription
  additionalDescription?: string
  images?: Array<{ url?: string; [key: string]: unknown }>
  created?: string
  updated?: string
  [key: string]: unknown
}

/** A category set (container for shop categories). */
export interface RakutenCategorySet {
  categorySetId: string
  title?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RakutenCategory): Collection {
  const description = raw.description?.text ?? raw.additionalDescription

  const image =
    raw.images && raw.images.length > 0 && raw.images[0].url
      ? { url: raw.images[0].url }
      : undefined

  return {
    id: raw.categoryId,
    title: raw.title ?? raw.categoryId,
    description,
    type: 'MANUAL',
    image,
    updatedAt: raw.updated ?? undefined,
    publishedAt: raw.created ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Transform a category set into a top-level collection (with no productIds). */
export function transformCategorySet(raw: RakutenCategorySet): Collection {
  return {
    id: raw.categorySetId,
    title: raw.title ?? raw.categorySetId,
    type: 'MANUAL',
    updatedAt: raw.updated ?? undefined,
    publishedAt: raw.created ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
