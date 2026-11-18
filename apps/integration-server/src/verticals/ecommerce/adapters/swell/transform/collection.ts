/**
 * Swell category → canonical Collection.
 *
 * Fields read, from the category model
 * (https://developers.swell.is/backend-api/categories):
 *   id, name ("A human-friendly name for the category."), slug, description,
 *   images[] { id, caption, file { url, width, height } } ("List of images
 *   depicting the category."), date_updated.
 *
 * Not mapped:
 *  - `type`: a category's `sorting` is "Default product sorting applied when
 *    retrieving products", not a rule-based membership, so nothing documents
 *    a MANUAL/SMART distinction.
 *  - `productIds`: `products` is an "Expandable list of category products",
 *    absent unless expanded and capped at 5 when it is.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawSwellCategory {
  id: string
  name: string
  slug?: string | null
  description?: string | null
  images?: Array<{
    id?: string
    caption?: string | null
    file?: { url?: string | null; width?: number | null; height?: number | null } | null
  }> | null
  date_created?: string | null
  date_updated?: string | null
  [key: string]: unknown
}

export function transformCollection(raw: RawSwellCategory): Collection {
  const first = raw.images?.find((i) => i.file?.url)
  const image: Image | undefined = first?.file?.url
    ? {
        id: first.id,
        url: first.file.url,
        alt: first.caption ?? undefined,
        width: first.file.width ?? undefined,
        height: first.file.height ?? undefined,
      }
    : undefined

  return {
    id: raw.id,
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    image,
    updatedAt: raw.date_updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title !== undefined) body['name'] = collection.title
  if (collection.handle !== undefined) body['slug'] = collection.handle
  if (collection.description !== undefined) body['description'] = collection.description
  return body
}
