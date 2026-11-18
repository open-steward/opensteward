/**
 * Volusion Category → canonical Collection.
 *
 * Volusion uses "Categories" rather than "Collections". All categories are
 * manually curated (no smart/auto collections).
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawVolusionCategory {
  CategoryID: number | string
  CategoryName: string
  CategoryDescription?: string | null
  SEFriendlyName?: string | null
  CategoryImage?: string | null
  IsActive?: boolean
  SortOrder?: number
  DateCreated?: string | null
  LastModified?: string | null
  [key: string]: unknown
}

function mapImage(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  return { url }
}

export function transformCollection(raw: RawVolusionCategory): Collection {
  return {
    id: String(raw.CategoryID),
    title: raw.CategoryName,
    handle: raw.SEFriendlyName ?? undefined,
    description: raw.CategoryDescription ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.CategoryImage),
    updatedAt: raw.LastModified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Volusion category body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    CategoryName: collection.title,
    CategoryDescription: collection.description,
    SEFriendlyName: collection.handle,
    CategoryImage: collection.image?.url,
  }
}
