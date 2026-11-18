/**
 * Revel ProductCategory → canonical Collection.
 *
 * Revel categories are listed at `/products/ProductCategory/` and read one at a
 * time at `/products/ProductCategory/{ProductCategoryId}/` (products_suite.yaml,
 * 2025.3.0). The documented row carries its image as `img_url` ("Image of this
 * category") and offset-less datetimes (example 2016-09-14T11:30:06.518725,
 * read as UTC).
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'

export interface RawRevelCategory {
  id: number
  name?: string
  description?: string
  sort_order?: number
  /** "Sort categories on POS ascending". */
  sorting?: number
  active?: boolean
  /** "Image of this category" — the documented field. */
  img_url?: string
  image?: string
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawRevelCategory): Collection {
  const image = raw.img_url || raw.image
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: image ? { url: image } : undefined,
    updatedAt: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Revel category body for create/update. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title != null) body['name'] = collection.title
  if (collection.description != null) body['description'] = collection.description
  return body
}
