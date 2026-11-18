/**
 * Alibaba.com category → canonical Collection.
 *
 * Two documented shapes:
 *
 *   - a `data[]` row of "Get Category Information"
 *     (/alibaba/icbu/category/get/v2, cid=11): category_id ("Alibaba category
 *     id"), category_name ("Alibaba category name"), leaf_category, level;
 *   - `result.result` of alibaba.icbu.category.get.new
 *     (/icbu/product/category/get, cid=1): category_id ("unique category id"),
 *     name ("english name"), cn_name, level, leaf_category, child_ids,
 *     parent_ids.
 *
 * The category is Alibaba's publishing taxonomy, so no collection type is
 * claimed; the raw row is kept in metadata.
 */

import type { Collection } from '../../../schema/collection'

/** category/get/v2 `data[]`. */
export interface RawAlibabaCategoryRow {
  category_id?: number | string
  category_name?: string
  leaf_category?: boolean | string
  level?: number | string
  [key: string]: unknown
}

/** category.get.new `result.result`. */
export interface RawAlibabaCategoryNode {
  category_id?: number | string
  name?: string
  cn_name?: string
  leaf_category?: boolean | string
  level?: number | string
  child_ids?: (number | string)[]
  parent_ids?: string
  [key: string]: unknown
}

/** Canonical titles are required; an absent or empty source field is refused, not filled in. */
function requireTitle(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Alibaba ${what}`)
  return value
}

function requireId(id: number | string | undefined, where: string): string {
  if (id == null || id === '') throw new Error(`Alibaba ${where} has no category_id`)
  return String(id)
}

export function transformCategoryRow(raw: RawAlibabaCategoryRow): Collection {
  return {
    id: requireId(raw.category_id, 'category/get/v2 row'),
    title: requireTitle(raw.category_name, 'category/get/v2 row has no category_name'),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCategoryNode(raw: RawAlibabaCategoryNode): Collection {
  return {
    id: requireId(raw.category_id, 'category.get.new result'),
    title: requireTitle(raw.name, 'category.get.new result has no name'),
    metadata: raw as Record<string, unknown>,
  }
}
