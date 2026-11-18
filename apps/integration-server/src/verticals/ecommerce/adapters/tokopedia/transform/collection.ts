/**
 * Tokopedia showcase → canonical Collection.
 *
 * Tokopedia organises a shop's product display through "Showcases" —
 * curated sections visible on the shop page. These map naturally to
 * canonical Collection records.
 *
 * Endpoint: GET /v1/showcase/fs/:fs_id/get?shop_id={shop_id}
 * Response fields: id, Name, alias, uri, product_count, is_highlighted,
 *                  badge, ace_default_sort
 *
 * Note: Tokopedia does not return product_ids in the showcase list
 * response — only a product_count. The canonical productIds field is
 * therefore omitted (it is optional in the schema).
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/api-reference/tokopedia/shop-api/get-showcase/
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaShowcase {
  id?: number
  Name?: string
  alias?: string
  uri?: string
  product_count?: number
  is_highlighted?: boolean
  badge?: string
  ace_default_sort?: number
  [key: string]: unknown
}

export interface RawTokopediaShowcaseResponse {
  header?: {
    process_time?: number
    messages?: string
    reason?: string
    error_code?: string
  }
  data?: {
    showcase?: RawTokopediaShowcase[]
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawTokopediaShowcase): Collection {
  const id = raw.id != null ? String(raw.id) : raw.alias ?? '0'

  return {
    id,
    title: raw.Name ?? id,
    handle: raw.alias,
    description: undefined,
    type: 'MANUAL',
    productIds: undefined, // not returned in the showcase list response
    image: undefined,
    updatedAt: undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
