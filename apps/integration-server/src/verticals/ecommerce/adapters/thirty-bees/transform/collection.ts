/**
 * Thirty Bees Category → canonical Collection.
 *
 * Thirty Bees (PrestaShop 1.6 fork) exposes a webservice resource
 * `/api/categories`. The name and description fields may be returned
 * as strings or as language-keyed objects depending on the display mode
 * and store configuration.
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Thirty Bees shape ───────────────────────────────────────────────────

export interface RawThirtyBeesCategory {
  id: number | string
  name?: string | Record<string, string> | null
  description?: string | Record<string, string> | null
  link_rewrite?: string | Record<string, string> | null
  active?: string | number | null
  date_add?: string | null
  date_upd?: string | null
  id_parent?: number | string | null
  associations?: {
    products?: Array<{ id: number | string }>
  }
  [key: string]: unknown
}

// ── Helper ──────────────────────────────────────────────────────────────────

function extractString(
  v: string | Record<string, string> | null | undefined,
): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformCollection(raw: RawThirtyBeesCategory): Collection {
  const productIds = (raw.associations?.products ?? []).map((p) => String(p.id))
  return {
    id: String(raw.id),
    title: extractString(raw.name) ?? '',
    description: extractString(raw.description),
    handle: extractString(raw.link_rewrite),
    type: 'MANUAL',
    productIds: productIds.length > 0 ? productIds : undefined,
    updatedAt: toIsoDatetime(raw.date_upd),
    publishedAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Thirty Bees category body (for create / update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    link_rewrite: collection.handle,
    active: 1,
  }
}
