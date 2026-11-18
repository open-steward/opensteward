/**
 * EverShop Category → canonical Collection.
 *
 * EverShop's concept of "categories" maps to the canonical `Collection`
 * type. Categories are always manually curated (MANUAL), support a name,
 * url_key, description, image, and status.
 *
 * Docs: https://evershop.io/docs/api/category
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEverShopCategory {
  category_id?: number | string
  uuid?: string
  name?: string | null
  url_key?: string | null
  description?: string | null
  image?: string | null
  status?: number | string | boolean | null
  parent_id?: number | string | null
  include_in_nav?: number | string | boolean | null
  position?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function buildImageFromPath(path: string | null | undefined): Image | undefined {
  if (!path) return undefined
  const url =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : path.startsWith('/')
        ? path
        : `/${path}`
  return { url }
}

export function transformCollection(raw: RawEverShopCategory): Collection {
  const id = raw.uuid ?? (raw.category_id != null ? String(raw.category_id) : String(raw.name ?? ''))

  return {
    id,
    title: raw.name ?? '',
    handle: raw.url_key ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: buildImageFromPath(raw.image),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → EverShop category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    url_key: collection.handle,
    description: collection.description ?? [],
    meta_title: collection.title ?? '',
    meta_description: collection.description ?? '',
  }
  if (collection.image?.url) {
    body['image'] = collection.image.url
  }
  return body
}
