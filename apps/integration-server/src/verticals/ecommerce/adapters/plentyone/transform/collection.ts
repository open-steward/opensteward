/**
 * PlentyONE Category → canonical Collection.
 *
 * PlentyONE categories are used to group items (products). The API returns a
 * page-based list at GET /rest/categories (filter by type=item for product
 * categories). Each category has localized `details` entries with name and
 * description per language.
 *
 * Endpoints used:
 *   GET /rest/categories?type=item&with=details
 *   GET /rest/categories/{categoryId}?with=details
 *   POST /rest/categories
 *   PUT /rest/categories/{categoryId}
 *   DELETE /rest/categories/{categoryId}
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneCategoryDetail {
  lang: string
  name?: string | null
  description?: string | null
  previewUrl?: string | null
  [key: string]: unknown
}

export interface RawPlentyOneCategory {
  id: number | string
  parentCategoryId?: number | string | null
  level?: number
  type?: string
  updatedAt?: string
  details?: RawPlentyOneCategoryDetail[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickDetail(
  details: RawPlentyOneCategoryDetail[] | undefined,
): RawPlentyOneCategoryDetail | undefined {
  if (!details || details.length === 0) return undefined
  return details.find((d) => d.lang === 'en') ?? details[0]
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCategory(raw: RawPlentyOneCategory): Collection {
  const detail = pickDetail(raw.details)
  return {
    id: String(raw.id),
    title: detail?.name ?? String(raw.id),
    description: detail?.description ?? undefined,
    type: 'MANUAL',
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → PlentyONE category body for create/update. */
export function untransformCategory(collection: Partial<Collection>): Record<string, unknown> {
  const details: RawPlentyOneCategoryDetail[] = []
  if (collection.title || collection.description) {
    details.push({
      lang: 'en',
      name: collection.title,
      description: collection.description,
    })
  }
  return {
    type: 'item',
    details: details.length > 0 ? details : undefined,
  }
}
