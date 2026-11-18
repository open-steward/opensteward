/**
 * Spree Taxon → canonical Collection.
 *
 * Spree uses "taxons" (taxonomy categories) as its collection/category
 * system. Each taxon has a `name`, `permalink` (handle), `description`,
 * and a tree structure via `parent_id`.
 *
 * Platform API endpoint: `/api/v2/platform/taxons`
 */

import type { Collection } from '../../../schema/collection'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'

export interface RawSpreeTaxon {
  id: number | string
  name: string
  permalink?: string
  description?: string | null
  parent_id?: number | string | null
  taxonomy_id?: number | string
  position?: number
  depth?: number
  meta_title?: string | null
  meta_description?: string | null
  meta_keywords?: string | null
  is_root?: boolean
  is_leaf?: boolean
  updated_at?: string
  created_at?: string
  pretty_name?: string
  icon?: string | null
  product_ids?: Array<number | string>
  [key: string]: unknown
}

export function transformCollection(raw: RawSpreeTaxon): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: toSlug(raw.permalink),
    description: raw.description ?? undefined,
    type: 'MANUAL',
    productIds: raw.product_ids?.map(String),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    taxon: {
      name: collection.title,
      permalink: collection.handle,
      description: collection.description,
    },
  }
}
