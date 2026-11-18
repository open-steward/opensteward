/**
 * Shopee shop category → canonical Collection.
 *
 * Shopee exposes seller-defined "shop categories" (not the Shopee marketplace
 * taxonomy) via the Shop Category API. These are the storefront groupings a
 * seller creates to organise their items — the closest concept to a collection.
 *
 * API: GET /api/v2/shop_category/get_shop_category_list
 * Docs: https://open.shopee.com/documents (Shop Category module)
 */

import type { Collection, CollectionType } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeShopCategory {
  /** Unique identifier for the shop category. */
  shop_category_id: number
  /** Name of the shop category. */
  name?: string
  /** Status: 1 = NORMAL, 2 = INACTIVE, 0 = DELETED. */
  status?: number
  /** Sort weight — lower means higher priority. */
  sort_weight?: number
  /** Creator identifier (may be missing in some regions). */
  created_by?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(_status: number | undefined): CollectionType | undefined {
  // Shopee shop categories are manually curated — always MANUAL.
  // Status 0 (DELETED) won't appear in list results; 1 and 2 are both MANUAL.
  return 'MANUAL'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawShopeeShopCategory): Collection {
  return {
    id: String(raw.shop_category_id),
    title: raw.name ?? String(raw.shop_category_id),
    handle: undefined, // Shopee does not expose a URL handle
    description: undefined,
    type: mapStatus(raw.status),
    productIds: undefined, // Populated separately via get_shop_category_item_list
    image: undefined,
    updatedAt: undefined, // Not returned by list endpoint
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
