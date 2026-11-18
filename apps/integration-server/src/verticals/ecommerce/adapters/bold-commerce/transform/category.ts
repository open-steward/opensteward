/**
 * Bold Products API category → canonical Collection.
 *
 * Bold has no collections resource; its product grouping is the category
 * (`v2Category` in https://developer.boldcommerce.com/api/products.openapi.yaml,
 * "Lists product categories for the shop.").
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'
import { assetUrl } from '../fields'

export interface RawBoldCategory {
  id: number
  shop_identifier?: string
  platform_id?: unknown
  name?: string
  created_at?: string
  updated_at?: string
  image_url?: string
  [key: string]: unknown
}

export function transformCategory(raw: RawBoldCategory): Collection {
  if (!raw.name) throw new Error(`Bold category ${raw.id} has no name`)
  const out: Collection = {
    id: String(raw.id),
    title: raw.name,
    metadata: { ...raw },
  }
  const url = assetUrl(raw.image_url)
  if (url) out.image = { url }
  const updatedAt = toIsoDatetime(raw.updated_at)
  if (updatedAt) out.updatedAt = updatedAt
  return out
}
