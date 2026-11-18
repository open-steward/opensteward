/**
 * Orderchamp ProductCollection → canonical Collection transform. Read-only:
 * no `productCollectionCreate`/`Update`/`Delete` mutation exists anywhere in
 * Orderchamp's published schema — collections are a fixed, operator-owned
 * taxonomy, matching the platform's own guidance to "often fetch the list of
 * available categories" rather than manage them.
 *
 * Docs: https://developers.orderchamp.com/getting-started (type index: `ProductCollection`)
 */
import type { Collection } from '../../../schema/collection'

export interface RawOrderchampCollection {
  id: string
  title?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawOrderchampCollection): Collection {
  return {
    id: String(raw.id),
    title: raw.title ?? String(raw.id),
    metadata: raw as Record<string, unknown>,
  }
}
