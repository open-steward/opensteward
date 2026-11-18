/**
 * ColorMe Shop Group → canonical Collection.
 *
 * ColorMe has two grouping concepts: `categories` (a strict 2-level
 * hierarchy — every product has AT MOST one `category.id_big`/`id_small`)
 * and `groups` (a flat, many-to-many tag a product can carry several of, via
 * `product.group_ids[]`). `groups` is the one that matches the canonical
 * Collection's shape (a named set a product can belong to alongside others),
 * so collections map to groups here; categories are not exposed through this
 * interface.
 *
 * Docs: OpenAPI spec paths["/v1/groups"].
 * No delete endpoint is documented for groups.
 */

import type { Collection } from '../../../schema/collection'

export interface RawColormeGroup {
  id: number
  name: string
  expl?: string | null
  display_state: 'showing' | 'hidden' | 'showing_for_members' | 'sale_for_members'
  parent_group_id?: number | null
}

export function transformCollection(raw: RawColormeGroup): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.expl ?? undefined,
    type: 'MANUAL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return { name: collection.title, expl: collection.description }
}
