/**
 * Starweb ProductCategory → canonical Collection.
 *
 * Starweb categories are manually curated product groupings — there is no
 * rule-based "smart" category concept — so `type` is always `MANUAL`.
 *
 * Category names are localised under `languages` array; we use the first
 * entry. Product membership is not inlined in the category response;
 * `productIds` is left empty and callers should filter products by category.
 *
 * Docs: https://api-docs.starweb.se/
 */

import type { Collection } from '../../../schema/collection'

export interface RawStarwebCategoryLanguage {
  langCode?: string
  name?: string
  description?: string
  [key: string]: unknown
}

export interface RawStarwebCategory {
  categoryId: number | string
  createdAt?: string | null
  modifiedAt?: string | null
  parentId?: number | string | null
  sortIndex?: number | null
  externalId?: string | null
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  languages?: { data?: RawStarwebCategoryLanguage[] }
  [key: string]: unknown
}

export function transformCollection(raw: RawStarwebCategory): Collection {
  // languages include is wrapped in {data:[...]} envelope.
  const lang = (raw.languages?.data ?? [])[0]
  const title = lang?.name ?? String(raw.categoryId)
  return {
    id: String(raw.categoryId),
    title,
    description: lang?.description ?? undefined,
    type: 'MANUAL',
    productIds: [],
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Starweb category body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    languages: [
      {
        name: collection.title,
        description: collection.description,
      },
    ],
  }
}
