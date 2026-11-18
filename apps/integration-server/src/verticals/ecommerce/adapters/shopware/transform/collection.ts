/**
 * Shopware 6 Category → canonical Collection.
 *
 * Shopware's closest analogue to a collection is the category tree
 * (`/api/category`). Categories can be nested; we flatten them.
 *
 * Fields:
 *  - `name` — translated display name.
 *  - `active` — visibility flag.
 *  - `type` — 'page' (manual), 'link', 'folder'. We map page → MANUAL.
 *  - `productAssignments` or child products linked via `product_category`.
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawShopwareCategory {
  id: string
  parentId?: string | null
  name?: string
  active?: boolean
  type?: string // 'page' | 'link' | 'folder'
  description?: string | null
  level?: number
  path?: string | null
  productAssignmentType?: string
  children?: RawShopwareCategory[]
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformCollection(raw: RawShopwareCategory): Collection {
  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    type: raw.type === 'page' ? 'MANUAL' : 'MANUAL',
    productIds: [],
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    type: 'page',
    active: true,
  }
}
