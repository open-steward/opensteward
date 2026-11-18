/**
 * Tiendanube / Nuvemshop Category → canonical Collection.
 *
 * Tiendanube uses "categories" rather than "collections". Categories are
 * manually curated hierarchies — there is no "smart collection" equivalent.
 * All categories map to canonical type `MANUAL`.
 *
 * Key differences from Shopify:
 *  - `name`, `description`, and `handle` are i18n objects.
 *  - `visibility` field controls storefront display (not `published_at`).
 *  - Parent-child relationships via `parent` and `subcategories`.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/category
 */

import type { Collection } from '../../../schema/collection'

type I18nString = Record<string, string | null | undefined>

function i18n(obj: I18nString | string | null | undefined): string | undefined {
  if (obj == null) return undefined
  if (typeof obj === 'string') return obj || undefined
  const v = obj['en'] ?? obj['es'] ?? obj['pt'] ?? Object.values(obj).find((x) => x != null)
  return v ?? undefined
}

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeCategory {
  id: number | string
  name?: I18nString | string | null
  description?: I18nString | string | null
  handle?: I18nString | string | null
  parent?: number | string | null
  visibility?: string | null
  visibility_updated_at?: string | null
  subcategories?: RawTiendanubeCategory[]
  google_shopping_category?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCategory(raw: RawTiendanubeCategory): Collection {
  const isVisible = !raw.visibility || raw.visibility === 'visible'

  return {
    id: String(raw.id),
    title: i18n(raw.name as I18nString | string | null | undefined) ?? '',
    handle: i18n(raw.handle as I18nString | string | null | undefined) ?? undefined,
    description: i18n(raw.description as I18nString | string | null | undefined) ?? undefined,
    type: 'MANUAL',
    publishedAt: isVisible ? (raw.visibility_updated_at ?? raw.updated_at) : undefined,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Tiendanube category body (for create/update). */
export function untransformCategory(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title ? { en: collection.title } : undefined,
    description: collection.description ? { en: collection.description } : undefined,
    handle: collection.handle ? { en: collection.handle } : undefined,
  }
}
