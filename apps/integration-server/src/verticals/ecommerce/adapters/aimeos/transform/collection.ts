/**
 * Aimeos Catalog → canonical Collection.
 *
 * Aimeos exposes product categories via JSON:API at `GET /api/catalog`.
 * These categories are the Aimeos equivalent of "collections" in the
 * canonical ecommerce schema.
 *
 * `catalog` resource attributes (dot-notation):
 *   catalog.id           — numeric/string id
 *   catalog.code         — slug/code identifier
 *   catalog.label        — display name
 *   catalog.status       — int: 1=enabled, 0=disabled, -1=review, -2=archived
 *   catalog.config       — JSON config object (css class, etc.)
 *   catalog.hasChildren  — boolean: has child categories
 *   catalog.target       — link target
 *   catalog.ctime        — ISO datetime created
 *   catalog.mtime        — ISO datetime updated
 *
 * Products linked to a catalog are discoverable via the `catalog/lists`
 * relationship (not retrieved here to keep the transform lightweight).
 */

import type { Collection } from '../../../schema/collection'
import type { AimeosResource } from '../client'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosCatalogAttributes {
  'catalog.id'?: string | number
  'catalog.code'?: string
  'catalog.label'?: string
  'catalog.status'?: number
  'catalog.config'?: Record<string, unknown> | string | null
  'catalog.hasChildren'?: boolean
  'catalog.target'?: string | null
  'catalog.ctime'?: string | null
  'catalog.mtime'?: string | null
  [key: string]: unknown
}

export type AimeosCatalog = AimeosResource & {
  attributes: AimeosCatalogAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a slug from the catalog code or fallback to the id.
 * Catalog codes in Aimeos are unique short identifiers like "home", "best-seller".
 */
function toSlug(code: string | undefined, id: string): string {
  if (code && code.trim().length > 0) {
    return code.trim().toLowerCase().replace(/\s+/g, '-')
  }
  return id
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: AimeosCatalog): Collection {
  const attrs = raw.attributes

  return {
    id: raw.id,
    title: (attrs['catalog.label'] as string | undefined) ?? raw.id,
    handle: toSlug(attrs['catalog.code'] as string | undefined, raw.id),
    type: 'MANUAL',
    updatedAt: (attrs['catalog.mtime'] as string | undefined) ?? undefined,
    publishedAt:
      (attrs['catalog.status'] as number | undefined) === 1
        ? (attrs['catalog.ctime'] as string | undefined) ?? undefined
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
