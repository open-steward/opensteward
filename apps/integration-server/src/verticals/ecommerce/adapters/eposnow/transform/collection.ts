/**
 * Epos Now Category -> canonical Collection.
 *
 * Epos Now categories are simple groupings for products.
 */

import type { Collection } from '../../../schema/collection'

export interface RawEposNowCategory {
  Id?: number
  Name?: string
  ParentId?: number | null
  [key: string]: unknown
}

export function transformCollection(raw: RawEposNowCategory): Collection {
  return {
    id: String(raw.Id ?? ''),
    title: raw.Name ?? '',
    type: 'MANUAL',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection -> Epos Now category body for create/update. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title != null) body['Name'] = collection.title
  return body
}
