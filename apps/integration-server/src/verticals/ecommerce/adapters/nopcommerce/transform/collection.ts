/**
 * nopCommerce Category → canonical Collection.
 *
 * nopCommerce categories map to Shopify-style "collections". All
 * categories are manually curated (no "smart" rule-based categories),
 * so we hardcode `type: 'MANUAL'`.
 *
 * nopCommerce categories do not inline their member product ids — products
 * reference categories via `category_ids`, not the other way around — so
 * `productIds` stays empty.
 *
 * API: `/api/categories` returns `{ categories: [...] }`
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawNopCategory {
  id: number | string
  name: string
  description?: string | null
  se_name?: string | null
  published?: boolean
  deleted?: boolean
  display_order?: number
  parent_category_id?: number | string | null
  picture_id?: number | string | null
  image?: { id?: number | string; src?: string; alt?: string | null } | null
  created_on_utc?: string
  updated_on_utc?: string
  product_ids?: Array<number | string>
  [key: string]: unknown
}

function mapImage(
  raw: RawNopCategory,
): Image | undefined {
  if (!raw.image || !raw.image.src) return undefined
  return {
    id: raw.image.id != null ? String(raw.image.id) : undefined,
    url: raw.image.src,
    alt: raw.image.alt ?? undefined,
  }
}

export function transformCollection(raw: RawNopCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.se_name ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: raw.product_ids?.map((p) => String(p)) ?? [],
    image: mapImage(raw),
    updatedAt: raw.updated_on_utc,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    se_name: collection.handle,
    description: collection.description,
  }
  if (collection.image?.url) {
    body['image'] = { src: collection.image.url, alt: collection.image.alt }
  }
  return body
}
