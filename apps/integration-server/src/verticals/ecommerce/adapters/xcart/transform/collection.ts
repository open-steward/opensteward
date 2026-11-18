/**
 * X-Cart Category → canonical Collection.
 *
 * X-Cart categories are accessed via GET /api/categories.
 * They map cleanly to the canonical Collection entity.
 *
 * Key fields:
 *   id, name, description, parent_id, enabled
 */
import type { Collection } from '../../../schema/collection'

export interface XCartCategory {
  id: number | string
  name?: string
  description?: string | null
  parent_id?: number | string | null
  enabled?: boolean | null
  [key: string]: unknown
}

export function transformCollection(raw: XCartCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: [],
    metadata: raw as unknown as Record<string, unknown>,
  }
}
