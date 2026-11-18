/**
 * Newegg Inventory → canonical InventoryLevel.
 *
 * Newegg's inventory is managed per seller part number. The inventory
 * endpoint returns available quantity and warehouse info.
 *
 * POST /contentmgmt/item/inventory → batch query
 * PUT  /contentmgmt/item/inventory → update
 *
 * Since Newegg inventory is single-location for most sellers, we use
 * a synthetic `locationId` of `newegg-default` unless a warehouse code
 * is present.
 */

import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggInventoryItem {
  SellerPartNumber: string
  NeweggItemNumber?: string
  AvailableQuantity?: number
  WarehouseLocation?: string
  FulfillmentOption?: string   // 'Seller' or 'Newegg' (SBN / SBS)
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'newegg-default'

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Newegg inventory item → canonical InventoryLevel.
 */
export function transformInventoryLevel(raw: RawNeweggInventoryItem): InventoryLevel {
  const locationId = raw.WarehouseLocation ?? DEFAULT_LOCATION_ID
  const available = raw.AvailableQuantity ?? 0

  return {
    id: `${raw.SellerPartNumber}:${locationId}`,
    variantId: raw.SellerPartNumber,
    locationId,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
