/**
 * Znode Category → canonical Collection.
 *
 * Znode categories live at `/api/categories`. They are hierarchical
 * with parent/child via `ParentCategoryId`. We use MANUAL collection
 * type since Znode categories are manually curated.
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawZnodeCategory {
  CategoryId?: number
  CategoryName?: string
  CategoryDescription?: string
  SEOUrl?: string
  ParentCategoryId?: number | null
  DisplayOrder?: number
  IsActive?: boolean
  CreatedDate?: string
  ModifiedDate?: string
  ProductCount?: number
  [key: string]: unknown
}

export function transformCollection(raw: RawZnodeCategory): Collection {
  return {
    id: String(raw.CategoryId ?? ''),
    title: raw.CategoryName ?? '',
    handle: raw.SEOUrl,
    description: raw.CategoryDescription,
    type: 'MANUAL',
    productIds: [],
    updatedAt: toIsoDatetime(raw.ModifiedDate),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentCategoryId: raw.ParentCategoryId != null ? String(raw.ParentCategoryId) : undefined,
    },
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    CategoryName: collection.title,
    CategoryDescription: collection.description,
    SEOUrl: collection.handle,
  }
}
