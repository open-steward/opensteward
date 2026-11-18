/**
 * Vendure Collection -> canonical Collection.
 *
 * Vendure collections can be manual or dynamic (filter-based).
 * Dynamic collections have `filters[]` configured; manual ones do not.
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawVendureCollection {
  id: string
  name: string
  slug?: string
  description?: string | null
  isPrivate?: boolean
  featuredAsset?: { id?: string; preview?: string; source?: string; name?: string } | null
  productVariants?: { items?: Array<{ product?: { id: string } }>; totalItems?: number } | null
  filters?: Array<{ code?: string; args?: unknown[] }> | null
  parent?: { id?: string; name?: string } | null
  children?: Array<{ id?: string; name?: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapImage(asset: RawVendureCollection['featuredAsset']): Image | undefined {
  if (!asset || (!asset.preview && !asset.source)) return undefined
  return {
    id: asset.id,
    url: asset.preview ?? asset.source ?? '',
    alt: asset.name ?? undefined,
  }
}

function mapType(raw: RawVendureCollection): CollectionType {
  // If filters are present and non-empty, it's a SMART collection
  if (raw.filters && raw.filters.length > 0) return 'SMART'
  return 'MANUAL'
}

export function transformCollection(raw: RawVendureCollection): Collection {
  // Extract unique product IDs from productVariants
  const productIds = raw.productVariants?.items
    ?.map((pv) => pv.product?.id)
    .filter((id): id is string => !!id)
  const uniqueProductIds = productIds ? [...new Set(productIds)] : undefined

  return {
    id: String(raw.id),
    title: raw.name,
    handle: raw.slug,
    description: raw.description ?? undefined,
    type: mapType(raw),
    productIds: uniqueProductIds && uniqueProductIds.length > 0 ? uniqueProductIds : undefined,
    image: mapImage(raw.featuredAsset),
    updatedAt: raw.updatedAt,
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
    isPrivate: false,
  }
}
