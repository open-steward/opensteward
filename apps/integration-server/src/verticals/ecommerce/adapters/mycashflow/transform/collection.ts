/**
 * MyCashflow Category → canonical Collection.
 *
 * MyCashflow organises products into a hierarchical category tree. All
 * categories are manually curated so we always emit `type: 'MANUAL'`.
 *
 * Categories do not inline member product ids — products reference categories
 * via a `categories` array — so `productIds` is left empty. Callers that need
 * category membership should use `GET /v1/categories/{id}/product-links`.
 *
 * Docs: https://support.mycashflow.com/api/13-categories/
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawMyCashflowCategoryImage {
  id?: number | string
  url?: string
  filename?: string
  alt?: string | null
  [key: string]: unknown
}

export interface RawMyCashflowCategory {
  id: number | string
  name: string
  /** URL slug for this category. */
  slug?: string | null
  description?: string | null
  parent_id?: number | string | null
  parent_sort?: number | null
  default_template?: string | null
  image?: RawMyCashflowCategoryImage | null
  external_id?: number | string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapImage(img: RawMyCashflowCategoryImage | null | undefined): Image | undefined {
  if (!img) return undefined
  const url = img.url ?? (img.filename ? `/${img.filename}` : undefined)
  if (!url) return undefined
  return {
    id: img.id != null ? String(img.id) : undefined,
    url,
    alt: img.alt ?? undefined,
  }
}

export function transformCollection(raw: RawMyCashflowCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.image),
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → MyCashflow category body (for create/update). */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
  }
}
