/**
 * Salla Category → canonical Collection.
 *
 * Salla categories are hierarchical:
 *  - id, name, image (url string), parent_id, status, sort_order
 *  - urls: { customer, admin }
 *  - metadata: { title, description, url }
 *  - sub_categories[] (child category summaries)
 *  - update_at (date object)
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaCategoryDateObj {
  date?: string
  timezone?: string
}

export interface RawSallaCategory {
  id: number | string
  name?: string
  image?: string | null
  parent_id?: number | string | null
  status?: string
  sort_order?: number | null
  has_hidden_products?: boolean
  urls?: { customer?: string; admin?: string }
  metadata?: { title?: string; description?: string; url?: string }
  sub_categories?: Array<{ id: number | string; name?: string }>
  update_at?: RawSallaCategoryDateObj | string | null
  updated_at?: RawSallaCategoryDateObj | string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSallaDate(date: RawSallaCategoryDateObj | string | null | undefined): string | undefined {
  if (!date) return undefined
  if (typeof date === 'string') return toIsoDatetime(date)
  if (date.date) {
    return toIsoDatetime(date.date)
  }
  return undefined
}

function mapImage(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  return { url }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCollection(raw: RawSallaCategory): Collection {
  const updatedAt = parseSallaDate(raw.update_at ?? raw.updated_at)

  return {
    id: String(raw.id),
    title: raw.name ?? String(raw.id),
    description: raw.metadata?.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.image),
    updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Salla category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    image: collection.image?.url,
  }
}
