/**
 * ManoMano Category → canonical Collection.
 *
 * ManoMano's Categories API returns the taxonomy tree used to classify
 * products. Leaf categories are the most useful for sellers mapping their
 * listings; the adapter surfaces all categories as MANUAL collections.
 *
 * Categories API response envelope:
 *   {
 *     categories: [
 *       {
 *         id: string | number,
 *         name: string,
 *         slug: string,
 *         parent_id: string | number | null,
 *         description: string | null,
 *         image_url: string | null,
 *         updated_at: string
 *       }
 *     ],
 *     total: number
 *   }
 *
 * Docs: https://www.manomano.dev/
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

export interface RawManomanoCategory {
  id: string | number
  name: string
  slug?: string | null
  parent_id?: string | number | null
  description?: string | null
  image_url?: string | null
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCategory(raw: RawManomanoCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: raw.image_url ? { url: raw.image_url } : undefined,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
