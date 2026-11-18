/**
 * IdoSell Category → canonical Collection.
 *
 * Shape verified against https://idosell.readme.io/reference/productscategoriesget
 * (list) and https://idosell.readme.io/reference/productscategoriesput
 * (create/edit/delete — a single endpoint keyed by `operation: "add"|"edit"|"del"`).
 * IdoSell categories are always a manually curated tree (there is no
 * rule-based "smart collection" concept), so `type` is always `MANUAL`.
 */

import type { Collection } from '../../../schema/collection'

export interface RawIdosellLangDataEntry {
  lang_id?: string
  singular_name?: string
  plural_name?: string
  description?: string
}

export interface RawIdosellCategory {
  id: number | string
  parent_id?: number | string
  priority?: number
  lang_data?: RawIdosellLangDataEntry[]
}

function pickLang(
  entries: RawIdosellLangDataEntry[] | undefined,
  lang?: string,
): RawIdosellLangDataEntry | undefined {
  if (!entries || entries.length === 0) return undefined
  if (lang) {
    const match = entries.find((e) => e.lang_id === lang)
    if (match) return match
  }
  return entries[0]
}

export function transformCollection(raw: RawIdosellCategory, lang?: string): Collection {
  const entry = pickLang(raw.lang_data, lang)
  return {
    id: String(raw.id),
    title: entry?.singular_name || entry?.plural_name || String(raw.id),
    description: entry?.description || undefined,
    type: 'MANUAL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Collection → one `params.categories[]` entry for
 * `PUT /products/categories`. `operation` is set by the caller (`add` /
 * `edit` / `del`) since it is not part of the canonical shape.
 */
export function untransformCollection(
  collection: Partial<Collection>,
  lang = 'eng',
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.id) body['id'] = Number(collection.id)
  if (collection.title || collection.description) {
    body['lang_data'] = [
      {
        lang_id: lang,
        singular_name: collection.title,
        plural_name: collection.title,
        description: collection.description,
      },
    ]
  }
  return body
}
