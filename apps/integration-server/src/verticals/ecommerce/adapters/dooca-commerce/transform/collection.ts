/**
 * Dooca Commerce Category → canonical Collection.
 *
 * Dooca's product categories map to the canonical Collection resource.
 * Categories are fetched from `/categories` and have the following key fields:
 *   - `name` (not `title`)
 *   - `slug` for the handle
 *   - `description` (HTML)
 *   - `image` with a `url` field
 *   - `active` (boolean)
 *   - `created_at`, `updated_at`
 *
 * Docs: https://docs.dooca.com.br/produtos/api
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawDoocaCategoryImage {
  url?: string | null
  title?: string | null
  [key: string]: unknown
}

export interface RawDoocaCategory {
  id: number | string
  name: string
  slug?: string | null
  description?: string | null
  image?: RawDoocaCategoryImage | null
  active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapImage(img: RawDoocaCategoryImage | null | undefined): Image | undefined {
  if (!img || !img.url) return undefined
  return {
    url: img.url,
    alt: img.title ?? undefined,
  }
}

export function transformCollection(raw: RawDoocaCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug ?? undefined,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.image),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Dooca category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
    image: collection.image?.url ? { url: collection.image.url, title: collection.image.alt } : undefined,
    active: true,
  }
}
