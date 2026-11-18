/**
 * Saleor Collection → canonical Collection.
 *
 * Saleor Collections are flat groups (manual curation). They are NOT
 * hierarchical categories.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawSaleorCollection {
  id: string
  name: string
  slug?: string
  description?: string | null
  backgroundImage?: { url?: string; alt?: string | null } | null
  products?: { edges?: Array<{ node?: { id: string } }> } | null
  [key: string]: unknown
}

function mapImage(bg: RawSaleorCollection['backgroundImage']): Image | undefined {
  if (!bg || !bg.url) return undefined
  return { url: bg.url, alt: bg.alt ?? undefined }
}

export function transformCollection(raw: RawSaleorCollection): Collection {
  const productIds = raw.products?.edges
    ?.map((e) => e.node?.id)
    .filter((id): id is string => !!id)

  return {
    id: raw.id,
    title: raw.name,
    handle: raw.slug,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: productIds && productIds.length > 0 ? productIds : undefined,
    image: mapImage(raw.backgroundImage),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    name: collection.title,
    slug: collection.handle,
    description: collection.description,
  }
}
