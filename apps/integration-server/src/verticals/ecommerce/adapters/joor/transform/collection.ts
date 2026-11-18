/**
 * JOOR Collection (Linesheet) → canonical Collection.
 *
 * JOOR calls collections "linesheets". Each linesheet has:
 *   id, name, external_id, archived, season, delivery dates, items (products).
 *
 * Docs: https://api-docs.jooraccess.com/reference/get-collections.md
 */

import type { Collection } from '../../../schema/collection'

// ── Raw JOOR shapes ──────────────────────────────────────────────────────────

export interface RawJoorCollectionDelivery {
  start_ship_date?: string | null
  complete_ship_date?: string | null
  cancel_date?: string | null
  minimum_shipping_window?: number
}

export interface RawJoorCollectionSeason {
  id?: string
  name?: string
  year?: number
  external_id?: string
}

export interface RawJoorCollectionItem {
  product_id?: string
  identifier?: string
  external_id?: string
  order_number?: number
}

export interface RawJoorCollection {
  id: string
  name: string
  external_id?: string
  archived?: boolean
  order_nbr?: number
  is_custom?: boolean
  made_to_order?: boolean
  delivery?: RawJoorCollectionDelivery
  season?: RawJoorCollectionSeason
  source?: string
  is_integrated?: boolean
  items?: RawJoorCollectionItem[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawJoorCollection): Collection {
  const productIds = (raw.items ?? [])
    .map((i) => i.product_id)
    .filter((id): id is string => Boolean(id))

  return {
    id: raw.id,
    title: raw.name,
    handle: raw.external_id ?? undefined,
    type: 'MANUAL',
    productIds: productIds.length > 0 ? productIds : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → JOOR linesheet body for create/update. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    external_id: collection.handle,
    items: collection.productIds?.map((id) => ({ product_id: id })),
  }
}
