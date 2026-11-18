/**
 * BigCommerce Category → canonical Collection.
 *
 * BigCommerce uses "categories" where most platforms use "collections".
 * Categories are hierarchical (parent_id) and manually managed —
 * there is no rule-based / smart equivalent.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawBigCommerceCategory {
  id: number | string
  name: string
  description?: string | null
  parent_id?: number
  sort_order?: number
  page_title?: string
  is_visible?: boolean
  custom_url?: { url?: string }
  image_url?: string | null
  [key: string]: unknown
}

function mapImage(url: string | null | undefined): Image | undefined {
  if (!url) return undefined
  return { url, alt: undefined }
}

export function transformCollection(raw: RawBigCommerceCategory): Collection {
  const handle = raw.custom_url?.url?.replace(/^\/|\/$/g, '') || undefined

  return {
    id: String(raw.id),
    title: raw.name,
    handle,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.image_url),
    publishedAt: raw.is_visible ? undefined : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → BigCommerce category body. */
export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title,
    description: collection.description,
  }
  if (collection.handle) {
    body.custom_url = { url: `/${collection.handle}/` }
  }
  if (collection.image?.url) {
    body.image_url = collection.image.url
  }
  return body
}
