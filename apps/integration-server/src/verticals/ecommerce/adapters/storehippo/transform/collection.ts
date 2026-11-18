/**
 * StoreHippo `ms.categories` record → canonical Collection.
 *
 * Fields, from the ms-categories reference
 * (https://help.storehippo.com/api/reference/ms-categories):
 *   name        "Name of the category." (ex Women's Apparels)
 *   alias       "Aliases are the unique category URL on storefront." (ex women-apparels)
 *   description "Brief description about the category."
 *   parent      "Parent category (if any) of the category."
 *   count       "It stores the count of products of a category."
 * `_id` and `updated_on` are on every record in the documented responses.
 *
 * Images are left out: the documented `image` is a file path relative to the
 * response's `fileBaseUrl` ("sample-image-women.png"), not a URL.
 */

import type { Collection } from '../../../schema/collection'
import { recordId, slug, text } from '../values'

export interface RawStoreHippoCategory {
  _id?: string
  name?: string
  alias?: string
  description?: string
  parent?: string
  count?: number
  updated_on?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawStoreHippoCategory): Collection {
  const id = recordId(raw, 'category')
  const title = text(raw.name)
  if (!title) throw new Error(`StoreHippo category ${id} has no name`)
  return {
    id,
    title,
    ...(slug(raw.alias) ? { handle: raw.alias } : {}),
    ...(text(raw.description) ? { description: raw.description } : {}),
    ...(text(raw.updated_on) ? { updatedAt: raw.updated_on } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Collection → StoreHippo category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    alias: collection.handle,
    description: collection.description,
    image: collection.image?.url
      ? { path: collection.image.url, alt: collection.image.alt }
      : undefined,
  }
}
