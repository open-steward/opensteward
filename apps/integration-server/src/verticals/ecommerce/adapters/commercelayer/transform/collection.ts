/**
 * Commerce Layer SKU List → canonical Collection.
 *
 * Commerce Layer **SKU Lists** group SKUs together — analogous to product
 * collections. They support both manual item assignment and regex-based rules.
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'

export interface RawCLSkuList {
  id: string
  name?: string
  slug?: string
  description?: string
  manual?: boolean
  sku_code_regex?: string
  created_at?: string
  updated_at?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapType(raw: RawCLSkuList): CollectionType {
  // manual=true means manually curated; regex-based = smart
  if (raw.manual === false || raw.sku_code_regex) return 'SMART'
  return 'MANUAL'
}

export function transformCollection(raw: RawCLSkuList): Collection {
  return {
    id: raw.id,
    title: raw.name ?? '',
    handle: toSlug(raw.slug),
    description: raw.description,
    type: mapType(raw),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    data: {
      type: 'sku_lists',
      attributes: {
        name: collection.title,
        slug: collection.handle,
        description: collection.description,
        manual: collection.type !== 'SMART',
      },
    },
  }
}
