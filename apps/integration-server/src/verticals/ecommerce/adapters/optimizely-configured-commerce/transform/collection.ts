/**
 * Maps Optimizely Configured Commerce's `CategoryModel` (Storefront API v1,
 * `GET /api/v1/categories` / `/api/v1/categories/{id}`) to the canonical
 * Collection shape.
 *
 * Categories are returned as a hierarchical tree (`subCategories` nests
 * recursively); `flattenCategories` walks the tree into the flat list the
 * canonical `listCollections` contract expects, since the vertical models
 * collections as a flat, independently-addressable resource.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/categoriesv1_getcollectionasync
 */
import { toSlug } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'

export interface RawOptimizelyCategory {
  id: string
  parentId?: string | null
  name?: string | null
  shortDescription?: string | null
  urlSegment?: string | null
  sortOrder?: number | null
  isFeatured?: boolean | null
  subCategories?: RawOptimizelyCategory[] | null
  [key: string]: unknown
}

export function transformCollection(raw: RawOptimizelyCategory): Collection {
  return {
    id: raw.id,
    title: raw.name?.trim() || raw.id,
    description: raw.shortDescription ?? undefined,
    handle: toSlug(raw.urlSegment ?? raw.name ?? undefined),
    metadata: raw as Record<string, unknown>,
  }
}

/** Depth-first flatten of a category tree into every node, parent and child alike. */
export function flattenCategories(
  categories: RawOptimizelyCategory[] | undefined | null,
): RawOptimizelyCategory[] {
  const out: RawOptimizelyCategory[] = []
  for (const category of categories ?? []) {
    out.push(category)
    if (category.subCategories && category.subCategories.length > 0) {
      out.push(...flattenCategories(category.subCategories))
    }
  }
  return out
}
