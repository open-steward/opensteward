/**
 * Trendyol Category → canonical Collection.
 *
 * Trendyol exposes a read-only category tree via:
 *   GET /integration/product/product-categories
 *
 * Each category has id, name, and optionally parentId. The tree is used
 * for product creation (required categoryId), not as a grouping of seller
 * products. We therefore map them to MANUAL Collections with empty productIds.
 *
 * Categories are read-only on Trendyol — the untransformCollection helper
 * exists only for interface completeness and should not be called.
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/product-api-endpoint
 */

import type { Collection } from '../../../schema/collection'

export interface RawTrendyolCategory {
  id: number | string
  name: string
  parentId?: number | string | null
  parentName?: string | null
  subCategories?: RawTrendyolCategory[]
  [key: string]: unknown
}

export function transformCollection(raw: RawTrendyolCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    type: 'MANUAL',
    productIds: [],
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Flatten a nested category tree into a list.
 * Trendyol returns nested subCategories arrays.
 */
export function flattenCategories(
  categories: RawTrendyolCategory[],
  result: RawTrendyolCategory[] = [],
): RawTrendyolCategory[] {
  for (const cat of categories) {
    result.push(cat)
    if (cat.subCategories && cat.subCategories.length > 0) {
      flattenCategories(cat.subCategories, result)
    }
  }
  return result
}
