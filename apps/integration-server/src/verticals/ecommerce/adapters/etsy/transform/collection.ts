/**
 * Etsy ShopSection → canonical Collection.
 *
 * Etsy organises listings into "shop sections", which function as collections.
 * A section has a title, a display-order rank, and a count of active listings.
 *
 * Endpoints used:
 *   GET  /shops/{shop_id}/sections            → list
 *   GET  /shops/{shop_id}/sections/{section_id} → get
 *   POST /shops/{shop_id}/sections            → create
 *   PUT  /shops/{shop_id}/sections/{section_id} → update
 *   DELETE /shops/{shop_id}/sections/{section_id} → delete
 *
 * Key mapping decisions:
 *  - `shop_section_id` (stringified) → canonical `id`
 *  - `title` → canonical `title`
 *  - type is always MANUAL (sections have no smart/rule-based concept)
 *  - No image, handle, or productIds exposed on this endpoint.
 *  - `rank` and `active_listing_count` surface via metadata.
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEtsyShopSection {
  shop_section_id: number
  title?: string
  rank?: number
  user_id?: number
  active_listing_count?: number
  [key: string]: unknown
}

export interface RawEtsyShopSections {
  count?: number
  results?: RawEtsyShopSection[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawEtsyShopSection): Collection {
  return {
    id: String(raw.shop_section_id),
    title: raw.title ?? String(raw.shop_section_id),
    type: 'MANUAL',
    metadata: {
      shop_section_id: raw.shop_section_id,
      rank: raw.rank,
      user_id: raw.user_id,
      active_listing_count: raw.active_listing_count,
    },
  }
}

export function untransformCollection(data: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.title != null) body['title'] = data.title
  return body
}
