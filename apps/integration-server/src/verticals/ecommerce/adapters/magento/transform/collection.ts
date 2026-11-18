/**
 * Magento Category → canonical Collection.
 *
 * Magento's closest analogue to a Shopify collection is the category
 * tree (`/V1/categories`). Categories are manually curated — Magento
 * does have "dynamic category" extensions but no core dynamic rule
 * shape — so we hardcode `type: 'MANUAL'`.
 *
 * Magento category endpoints return a tree root rather than a flat
 * list; the adapter walks `children_data` into a flat list before
 * passing individual nodes to this transform.
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMagentoCategory {
  id: number
  parent_id?: number
  name: string
  is_active?: boolean
  position?: number
  level?: number
  product_count?: number
  updated_at?: string
  children_data?: RawMagentoCategory[]
  custom_attributes?: Array<{ attribute_code: string; value: unknown }>
  [key: string]: unknown
}

function getCustomAttr(raw: RawMagentoCategory, code: string): string | undefined {
  const hit = raw.custom_attributes?.find((a) => a.attribute_code === code)
  return hit?.value != null ? String(hit.value) : undefined
}

export function transformCollection(raw: RawMagentoCategory): Collection {
  return {
    id: String(raw.id),
    title: raw.name,
    handle: getCustomAttr(raw, 'url_key'),
    description: getCustomAttr(raw, 'description'),
    type: 'MANUAL',
    productIds: [],
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  const customAttributes: Array<{ attribute_code: string; value: unknown }> = []
  if (collection.handle != null) {
    customAttributes.push({ attribute_code: 'url_key', value: collection.handle })
  }
  if (collection.description != null) {
    customAttributes.push({ attribute_code: 'description', value: collection.description })
  }
  return {
    category: {
      name: collection.title,
      is_active: true,
      include_in_menu: true,
      custom_attributes: customAttributes.length > 0 ? customAttributes : undefined,
    },
  }
}
