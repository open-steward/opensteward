/**
 * Recharge Collection Products → canonical Collection.
 *
 * Recharge exposes `/collections` with associated products via
 * `/collection_products`. The collection object has an id, title, and
 * optionally a sort_order. We treat collections as MANUAL (Recharge has no
 * rule-based collections).
 *
 * Docs: https://developer.rechargepayments.com/2021-11/collection_products
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeCollection {
  id: number | string
  title?: string | null
  handle?: string | null
  sort_order?: string | number | null
  created_at?: string | null
  updated_at?: string | null
  /** Product ids associated with this collection — populated by the adapter */
  productIds?: string[]
  [key: string]: unknown
}

export function transformCollection(raw: RawRechargeCollection): Collection {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    handle: raw.handle ?? undefined,
    type: 'MANUAL',
    productIds: raw.productIds ?? [],
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    title: collection.title,
    handle: collection.handle,
  }
}
