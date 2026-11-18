/**
 * BASE category ↔ canonical Collection.
 *
 * Confirmed fields (https://docs.thebase.in/api/categories,
 * .../api/categories/add): `category_id`, `name`, `list_order`, `number`,
 * `parent_number`, `code` (hyphen-separated hierarchy code, max 3 levels).
 * `POST /1/categories/add` accepts `name` (required), `list_order`
 * (optional), `parent_number` (optional). There is no documented
 * `categories/detail` endpoint — `getCollection` in ../index.ts fetches the
 * full list and filters, since a shop's category tree is small.
 */
import type { Collection } from '../../../schema/collection'

export interface RawBaseEcCategory {
  category_id: number | string
  name: string
  list_order?: number
  number?: number
  parent_number?: number
  code?: string
  [key: string]: unknown
}

export function transformCollection(category: RawBaseEcCategory): Collection {
  return {
    id: String(category.category_id),
    title: category.name,
    metadata: category as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(data: Partial<Collection>): Record<string, unknown> {
  if (!data.title) {
    throw new Error('BASE createCollection/updateCollection requires `title` (mapped to `name`).')
  }
  return { name: data.title }
}
