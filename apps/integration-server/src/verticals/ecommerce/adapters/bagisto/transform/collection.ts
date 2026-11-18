/**
 * Bagisto Category → canonical Collection.
 *
 * Bagisto's category tree maps naturally onto the canonical Collection.
 * Categories have a slug (`url_path` or `slug`), description, and optional
 * image. The Bagisto REST API (v1) returns categories at `/api/v1/categories`.
 */

import type { Collection } from '../../../schema/collection'

export interface BagistoCategory {
  id: number | string
  name: string
  slug?: string | null
  url_path?: string | null
  description?: string | null
  image_url?: string | null
  image?: string | null
  parent_id?: number | string | null
  position?: number | null
  status?: number | boolean | null
  created_at?: string | null
  updated_at?: string | null
  products?: Array<{ id: number | string }> | null
  [key: string]: unknown
}

export function transformCollection(raw: BagistoCategory): Collection {
  const handle = raw.slug ?? raw.url_path ?? undefined
  const imageUrl = raw.image_url ?? raw.image ?? undefined

  return {
    id: String(raw.id),
    title: raw.name,
    handle: handle ? handle.replace(/^\/|\/$/g, '') : undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: raw.products?.map((p) => String(p.id)),
    image: imageUrl ? { url: imageUrl } : undefined,
    updatedAt: raw.updated_at ?? undefined,
    publishedAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(data: Partial<Collection>): Record<string, unknown> {
  return {
    name: data.title,
    slug: data.handle,
    description: data.description,
  }
}
