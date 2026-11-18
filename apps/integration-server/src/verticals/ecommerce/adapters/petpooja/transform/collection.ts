/**
 * Petpooja category → canonical Collection.
 *
 * Petpooja menu categories map naturally to the canonical Collection shape.
 * Categories are always manually curated (MANUAL type) — there are no
 * rule-based "smart" categories in the Petpooja model.
 *
 * Petpooja category fields:
 *   categoryid, categoryname, category_image_url, active (0/1)
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import type { Collection } from '../../../schema/collection'

// ── Raw Petpooja shape ────────────────────────────────────────────────────────

export interface RawPetpoojaCategory {
  categoryid: number | string
  categoryname: string
  category_image_url?: string | null
  /** 0 = inactive, 1 = active */
  active?: number | string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawPetpoojaCategory): Collection {
  const imageUrl =
    raw.category_image_url && raw.category_image_url.trim().length > 0
      ? raw.category_image_url.trim()
      : undefined

  return {
    id: String(raw.categoryid),
    title: raw.categoryname,
    type: 'MANUAL',
    image: imageUrl ? { url: imageUrl } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Petpooja category body (for create/update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    categoryname: collection.title,
    category_image_url: collection.image?.url ?? null,
  }
}
