/**
 * OpenCart Category → canonical Collection.
 *
 * OpenCart categories map to the canonical Collection type. Categories
 * are hierarchical (parent_id references), all manually curated.
 *
 * Key mappings:
 *  - `category_id` → `id` (stringified)
 *  - `name` → `title`
 *  - `description` → `description`
 *  - `image` → collection image
 *  - `status` 1/0 → active/inactive (reflected in metadata)
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawOpenCartCategory {
  category_id: number | string
  name: string
  description?: string
  parent_id?: number | string
  image?: string | null
  sort_order?: number | string
  status?: number | string
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

function mapImage(img: string | null | undefined): Image | undefined {
  if (!img) return undefined
  // OpenCart stores image paths relative to the storefront /image/ prefix.
  // Make them root-relative so the canonical schema accepts the value.
  const url = /^https?:\/\//.test(img) || img.startsWith('/') ? img : `/${img}`
  return { url }
}

export function transformCollection(raw: RawOpenCartCategory): Collection {
  return {
    id: String(raw.category_id),
    title: raw.name,
    description: raw.description,
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.image),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    description: collection.description,
  }
  if (collection.image?.url) {
    body['image'] = collection.image.url
  }
  return body
}
