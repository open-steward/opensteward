/**
 * JTL-Shop Inventory (Lagerbestand) → canonical InventoryLevel.
 *
 * JTL-Shop exposes stock per article/variant under the article resource
 * (`stock` field) and potentially via `/api/v1/articles/{id}/stock` or
 * `/api/v1/variants/{id}/stock`. There is no separate "location" concept in
 * the shop REST API (warehousing is managed in JTL-Wawi, the ERP system).
 *
 * We synthesise:
 *  - `variantId` from the article/variant id
 *  - `locationId` as the constant `'default'` (single logical location)
 *  - `id` as `${variantId}:default`
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopStock {
  articleId?: number | string | null
  variantId?: number | string | null
  /** Available (sellable) quantity */
  available?: number | null
  /** Reserved for open orders */
  reserved?: number | null
  /** Physical on-hand quantity */
  onHand?: number | null
  /** Incoming from transfers / POs */
  incoming?: number | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInventoryLevel(
  raw: RawJtlShopStock,
  variantId: string,
): InventoryLevel {
  const locationId = 'default'
  const available = raw.available ?? 0
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed: raw.reserved ?? undefined,
    incoming: raw.incoming ?? undefined,
    onHand: raw.onHand ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
