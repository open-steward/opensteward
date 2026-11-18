/**
 * SAP Commerce Cloud Category → canonical Collection.
 *
 * SAP Commerce categories are organized in a tree via the catalog system.
 * The OCC API exposes them via `/catalogs/{catalogId}/{catalogVersionId}/categories/{categoryId}`.
 * A simpler list comes from `/categories` or product-level `categories[]`.
 *
 * Categories map to `MANUAL` collections since memberships are explicit
 * (products reference their categories).
 */

import { toSlug } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawSapCategoryImage {
  url?: string
  altText?: string
  format?: string
}

export interface RawSapCategory {
  id?: string
  code?: string
  name?: string
  url?: string
  description?: string
  image?: RawSapCategoryImage
  subcategories?: RawSapCategory[]
  productCount?: number
  [key: string]: unknown
}

function mapImage(raw: RawSapCategoryImage | undefined): Image | undefined {
  if (!raw?.url) return undefined
  return { url: raw.url, alt: raw.altText }
}

export function transformCollection(raw: RawSapCategory): Collection {
  return {
    id: raw.id ?? raw.code ?? '',
    title: raw.name ?? raw.code ?? '',
    handle: toSlug(raw.url?.replace(/^\//, '')),
    description: raw.description,
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.image),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    id: collection.id,
    name: collection.title,
    description: collection.description,
  }
}

export function buildPatchForCollection(
  updates: Partial<Collection>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (updates.title !== undefined) body['name'] = updates.title
  if (updates.description !== undefined) body['description'] = updates.description
  return body
}
