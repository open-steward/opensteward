/**
 * Allegro Offer Stock → canonical InventoryLevel.
 *
 * Allegro stores stock as a field on the offer: `stock.available` and
 * `stock.sold`. There is no separate inventory resource. The adapter
 * projects the stock field onto canonical InventoryLevel.
 *
 * Since Allegro does not expose per-location stock, all levels use a
 * synthetic `locationId` of `allegro-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawAllegroOffer } from './product'

const DEFAULT_LOCATION_ID = 'allegro-default'

/**
 * Allegro offer → canonical InventoryLevel.
 *
 * `variantId` = offer id (same as Product.id). The `available` quantity
 * comes from `stock.available`.
 */
export function transformInventoryLevel(raw: RawAllegroOffer): InventoryLevel {
  const available = raw.stock?.available ?? 0

  return {
    id: `${raw.id}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.id,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
