/**
 * SCAYLE ShopCategory → canonical Collection.
 *
 * SCAYLE refers to collections as "shop categories". Each ShopCategory has:
 *  - id (int), key (slug-like identifier), name (localised map),
 *    isHidden (bool), parentId (int|null), updatedAt
 *  - ShopCategoryCountry[] for per-country settings (active, url, etc.)
 *
 * We map categories to the canonical MANUAL type as SCAYLE categories are
 * manually curated hierarchies (no rule-based "smart" equivalent).
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Collection } from '../../../schema/collection'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleShopCategoryCountry {
  countryCode?: string
  active?: boolean
  url?: string | null
}

export interface RawScayleShopCategory {
  id: number | string
  key?: string | null
  name?: Record<string, string> | string
  isHidden?: boolean
  parentId?: number | string | null
  shopCountries?: RawScayleShopCategoryCountry[]
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function localeName(name: Record<string, string> | string | undefined): string {
  if (!name) return ''
  if (typeof name === 'string') return name
  return name['de'] ?? name['en'] ?? Object.values(name)[0] ?? ''
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawScayleShopCategory): Collection {
  return {
    id: String(raw.id),
    title: localeName(raw.name),
    handle: raw.key ?? undefined,
    type: 'MANUAL',
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → SCAYLE shop category body. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    key: collection.handle,
  }
  if (collection.title) {
    body.name = { de: collection.title, en: collection.title }
  }
  return body
}
