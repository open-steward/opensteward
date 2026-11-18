/**
 * ManoMano Offer stock → canonical InventoryLevel.
 *
 * ManoMano does not have a dedicated inventory ledger separate from offers.
 * Stock is a field on each offer (`stock.quantity`). The Offers API also
 * exposes a dedicated stock endpoint:
 *
 *   GET /offers/v1/offers/{sku_id}/stock
 *   →  { sku_id: string, quantity: number, updated_at: string }
 *
 * We synthesise the canonical InventoryLevel id as `{sku_id}:default`
 * because ManoMano does not expose warehouse/location concepts in the public
 * Partners API.
 *
 * Docs: https://www.manomano.dev/
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw ManoMano shapes ──────────────────────────────────────────────────────

export interface RawManomanoStock {
  sku_id?: string
  quantity?: number | null
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawManomanoStock): InventoryLevel {
  const skuId = raw.sku_id ?? 'unknown'
  const locationId = 'default'
  return {
    id: `${skuId}:${locationId}`,
    variantId: skuId,
    locationId,
    available: raw.quantity ?? 0,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
