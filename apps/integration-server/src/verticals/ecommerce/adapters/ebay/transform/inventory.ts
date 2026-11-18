/**
 * eBay Inventory Item → canonical InventoryLevel.
 *
 * eBay's inventory is a field on the inventory item itself:
 * `availability.shipToLocationAvailability.quantity`. There is no separate
 * inventory resource. The adapter iterates inventory items and projects
 * the quantity field onto canonical InventoryLevel.
 *
 * Since eBay does not expose per-location stock through the Inventory
 * API, all levels use a synthetic `locationId` of `ebay-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawEbayInventoryItem } from './product'

const DEFAULT_LOCATION_ID = 'ebay-default'

/**
 * eBay inventory item → canonical InventoryLevel.
 *
 * `variantId` = SKU (same as Product.id). The `available` quantity comes
 * from `shipToLocationAvailability.quantity`.
 */
export function transformInventoryLevel(raw: RawEbayInventoryItem): InventoryLevel {
  const available = raw.availability?.shipToLocationAvailability?.quantity ?? 0

  return {
    id: `${raw.sku}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.sku,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
