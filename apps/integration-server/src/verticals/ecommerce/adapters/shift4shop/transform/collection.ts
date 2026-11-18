/**
 * Shift4Shop Category → canonical Collection.
 *
 * Categories live under `/Categories` in the Shift4Shop REST API.
 * Each category has a numeric `CategoryID`, a `CategoryName`, and an
 * optional parent reference (`ParentCategoryID`).
 *
 * Docs: https://apirest.3dcart.com/3dCartWebAPI/v1/Categories
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopCategory {
  CategoryID?: number | string | null
  CategoryName?: string | null
  ParentCategoryID?: number | string | null
  DateAdded?: string | null
  LastUpdated?: string | null
  Description?: string | null
  CategoryLink?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawShift4ShopCategory): Collection {
  const id = String(raw.CategoryID ?? '')

  const handle = raw.CategoryLink
    ? raw.CategoryLink.replace(/\.html?$/i, '').split('/').pop()
    : undefined

  return {
    id,
    title: raw.CategoryName ?? '',
    handle,
    description: raw.Description ?? undefined,
    type: 'MANUAL',
    updatedAt: toIsoDatetime(raw.LastUpdated),
    publishedAt: toIsoDatetime(raw.DateAdded),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    ...(collection.title != null ? { CategoryName: collection.title } : {}),
    ...(collection.description != null ? { Description: collection.description } : {}),
  }
}
