/**
 * Walmart Inventory → canonical InventoryLevel.
 *
 * Walmart's Inventory API returns per-SKU inventory with quantity and
 * fulfillment center info:
 *   GET /v3/inventory?sku={sku} → get single item inventory
 *   GET /v3/inventory → list (paginated)
 *
 * Since Walmart's inventory endpoint returns items with a single
 * fulfillment node, we use a synthetic `locationId` of `walmart-default`
 * unless a `shipNode` is present.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartInventoryItem {
  sku: string
  quantity?: {
    unit?: string
    amount?: number
  }
  fulfillmentLagTime?: number
  shipNode?: string
  [key: string]: unknown
}

export interface RawWalmartInventoryEnvelope {
  inventories?: RawWalmartInventoryItem[]
  totalCount?: number
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'walmart-default'

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Walmart inventory item → canonical InventoryLevel.
 */
export function transformInventoryLevel(raw: RawWalmartInventoryItem): InventoryLevel {
  const locationId = raw.shipNode ?? DEFAULT_LOCATION_ID
  const available = raw.quantity?.amount ?? 0

  return {
    id: `${raw.sku}:${locationId}`,
    variantId: raw.sku,
    locationId,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
