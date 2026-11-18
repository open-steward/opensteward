/**
 * KORONA CommodityGroup → canonical Collection.
 *
 * Shape verified against `components.schemas.CommodityGroup` on
 * https://128.koronacloud.com/web/api/v3/openapi.json: "A commodity group
 * is similar to a product category or department. Commodity groups can be
 * nested to create a hierarchy." Always `MANUAL` — KORONA has no rule-based
 * collection concept, and CommodityGroup has no description field.
 */

import type { Collection } from '../../../schema/collection'
import type { KoronaModelReference } from './product'

export interface KoronaCommodityGroup {
  id: string
  number?: string
  key?: string
  name?: string
  parentCommodityGroup?: KoronaModelReference
}

export function transformCollection(raw: KoronaCommodityGroup): Collection {
  return {
    id: raw.id,
    title: raw.name || raw.number || raw.id,
    type: 'MANUAL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → KORONA body for `POST /commodityGroups` (add,
 *  array-batched) / `PATCH /commodityGroups/{id}` (edit). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title) body['name'] = collection.title
  return body
}
