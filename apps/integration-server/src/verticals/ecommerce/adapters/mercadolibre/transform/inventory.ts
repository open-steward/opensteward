/**
 * Mercado Libre Item → canonical InventoryLevel.
 *
 * Mercado Libre tracks stock on the item itself via `available_quantity`.
 * There is no separate inventory resource. The adapter projects the
 * quantity field onto canonical InventoryLevel.
 *
 * Since ML does not expose per-location stock, all levels use a
 * synthetic `locationId` of `meli-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawMeliItem } from './product'

const DEFAULT_LOCATION_ID = 'meli-default'

/**
 * ML item → canonical InventoryLevel.
 *
 * `variantId` = item ID (same as Product.id). The `available` quantity comes
 * from `available_quantity`.
 */
export function transformInventoryLevel(raw: RawMeliItem): InventoryLevel {
  const available = raw.available_quantity ?? 0

  return {
    id: `${raw.id}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.id,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
