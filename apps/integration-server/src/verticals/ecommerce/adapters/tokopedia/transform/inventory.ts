/**
 * Tokopedia stock info → canonical InventoryLevel.
 *
 * Tokopedia manages stock at the product level. Each product has a
 * `stock.value` field. For products with variants, each child product
 * has its own stock value.
 *
 * There is no separate "location" concept in Tokopedia's API —
 * warehouse management is handled internally. We use
 * `tokopedia-default` as a synthetic location id.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaInventoryItem {
  productID: number
  shopID?: number
  sku?: string
  stock?: number
  reservedStock?: number
  status?: number
  updateTime?: string
  warehouseID?: number
  [key: string]: unknown
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOCATION_ID = 'tokopedia-default'

// ── Transform ────────────────────────────────────────────────────────────────

export function transformInventoryLevel(raw: RawTokopediaInventoryItem): InventoryLevel {
  const available = raw.stock ?? 0
  const committed = raw.reservedStock

  const variantId = String(raw.productID)
  const locationId = raw.warehouseID != null
    ? String(raw.warehouseID)
    : DEFAULT_LOCATION_ID

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    committed,
    onHand: committed != null ? available + committed : undefined,
    updatedAt: toIsoDatetime(raw.updateTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
