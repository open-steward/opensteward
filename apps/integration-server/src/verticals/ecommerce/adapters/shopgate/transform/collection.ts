/**
 * Shopgate Category → canonical Collection.
 *
 * Shopgate calls product groupings "categories" in the Catalog Service. They
 * map cleanly to the canonical Collection type. Categories are identified by
 * a `code` string (not a numeric id).
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateCategory {
  code: string
  name?: string
  description?: string | null
  url?: string | null
  image?: { url?: string; altText?: string | null } | null
  parentCategoryCode?: string | null
  isActive?: boolean
  sequenceId?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapImage(
  img: RawShopgateCategory['image'],
): Image | undefined {
  if (!img || !img.url) return undefined
  return { url: img.url, alt: img.altText ?? undefined }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawShopgateCategory): Collection {
  return {
    id: raw.code,
    title: raw.name ?? raw.code,
    description: raw.description ?? undefined,
    // Shopgate categories are always manual (no rules engine).
    type: 'MANUAL',
    image: mapImage(raw.image),
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Shopgate category body (create/update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    code: collection.id,
    name: collection.title,
    description: collection.description,
    image: collection.image?.url
      ? { url: collection.image.url, altText: collection.image.alt }
      : undefined,
  }
}
