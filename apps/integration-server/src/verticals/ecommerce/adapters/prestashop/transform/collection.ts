/**
 * PrestaShop Category → canonical Collection.
 *
 * PrestaShop categories are hierarchical (id_parent) and serve as the
 * closest analogue to collections. All categories are manually curated,
 * so we hardcode `type: 'MANUAL'`.
 */

import type { Collection } from '../../../schema/collection'

export interface RawPrestaShopCategory {
  id: number | string
  name?: string | Record<string, string>
  link_rewrite?: string | Record<string, string>
  description?: string | Record<string, string>
  id_parent?: number | string | null
  active?: string | number
  position?: number | string
  level_depth?: number | string
  nb_products_recursive?: number
  associations?: {
    products?: Array<{ id: number | string }>
  }
  date_add?: string
  date_upd?: string
  [key: string]: unknown
}

function extractString(v: string | Record<string, string> | undefined | null): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

export function transformCollection(raw: RawPrestaShopCategory): Collection {
  const productIds = raw.associations?.products?.map((p) => String(p.id)) ?? []
  return {
    id: String(raw.id),
    title: extractString(raw.name) ?? '',
    handle: extractString(raw.link_rewrite),
    description: extractString(raw.description),
    type: 'MANUAL',
    productIds,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    link_rewrite: collection.handle,
    description: collection.description,
  }
}
