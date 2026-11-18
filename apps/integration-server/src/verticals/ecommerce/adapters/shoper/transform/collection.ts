/**
 * Shoper Category → canonical Collection.
 *
 * Shoper exposes categories under GET /webapi/rest/categories[/{id}].
 * Categories have translations (per-locale name/description) and a
 * flat list of product IDs.  They map naturally to the canonical
 * Collection type with `type: 'MANUAL'`.
 */

import type { Collection } from '../../../schema/collection'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperCategoryTranslation {
  name?: string
  description?: string
  active?: boolean | number
  [key: string]: unknown
}

export interface RawShoperCategory {
  category_id: number | string
  parent_id?: number | string | null
  translations?: Record<string, RawShoperCategoryTranslation>
  /** List of product IDs belonging to this category (may be omitted on list). */
  products?: Array<number | string>
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickTranslation(
  translations: Record<string, RawShoperCategoryTranslation> | undefined,
): RawShoperCategoryTranslation {
  if (!translations) return {}
  return (
    translations['pl_PL'] ??
    translations['en_GB'] ??
    translations['en_US'] ??
    Object.values(translations)[0] ??
    {}
  )
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawShoperCategory): Collection {
  const translation = pickTranslation(raw.translations)
  return {
    id: String(raw.category_id),
    title: translation.name ?? String(raw.category_id),
    description: translation.description ?? undefined,
    type: 'MANUAL',
    productIds: raw.products?.map((p) => String(p)),
    updatedAt: raw.edit_date ?? undefined,
    publishedAt: raw.add_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Shoper category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    translations: collection.title
      ? {
          pl_PL: {
            name: collection.title,
            description: collection.description ?? '',
            active: 1,
          },
        }
      : undefined,
  }
}
