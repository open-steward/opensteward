/**
 * CS-Cart Category → canonical Collection.
 *
 * CS-Cart uses "categories" as its collection concept. Categories are
 * hierarchical with a `parent_id` field. The REST endpoint is GET /api/categories.
 */

import type { Collection } from '../../../schema/collection'

export interface CsCartCategory {
  category_id: number | string
  category: string
  description?: string | null
  parent_id?: number | string | null
  timestamp?: number | string
  [key: string]: unknown
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformCollection(raw: CsCartCategory): Collection {
  return {
    id: String(raw.category_id),
    title: raw.category,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    updatedAt: tsToIso(raw.timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    category: collection.title,
    description: collection.description ?? undefined,
    parent_id: 0,
  }
}
