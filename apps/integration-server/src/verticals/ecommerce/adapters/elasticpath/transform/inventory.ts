/**
 * Elastic Path Inventory → canonical InventoryLevel.
 *
 * Elastic Path inventory is per-product: `GET /v2/inventories/{productId}`.
 * Response shape:
 *   { id, type: 'stock', total, available, allocated }
 *
 * Stock adjustments via `POST /v2/inventories/{productId}/transactions`:
 *   { type: 'stock-transaction', action: 'increment' | 'decrement' | 'allocate', quantity }
 *
 * Since there is no multi-location concept, locationId uses the synthetic default.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { SYNTHETIC_LOCATION_ID } from './location'

export interface RawEpInventory {
  id: string
  type: string // stock
  total?: number
  available?: number
  allocated?: number
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawEpInventory, productId?: string): InventoryLevel {
  const resolvedProductId = productId ?? raw.id
  return {
    id: `${resolvedProductId}:${SYNTHETIC_LOCATION_ID}`,
    variantId: resolvedProductId,
    locationId: SYNTHETIC_LOCATION_ID,
    available: raw.available ?? 0,
    committed: raw.allocated ?? 0,
    onHand: raw.total ?? (raw.available ?? 0) + (raw.allocated ?? 0),
    metadata: raw as Record<string, unknown>,
  }
}
