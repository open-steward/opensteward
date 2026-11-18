/**
 * Facebook Catalog Product → canonical InventoryLevel.
 *
 * Facebook's Catalog API includes an `inventory` field on products
 * representing the available quantity. There is no separate inventory
 * resource. The adapter projects product inventory onto canonical
 * InventoryLevel.
 *
 * Since Facebook does not expose per-location stock through the
 * Catalog API, all levels use a synthetic `locationId` of `facebook-default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { RawFacebookProduct } from './product'

const DEFAULT_LOCATION_ID = 'facebook-default'

/**
 * Facebook catalog product → canonical InventoryLevel.
 *
 * `variantId` = product id. The `available` quantity comes from the
 * `inventory` field on the product.
 */
export function transformInventoryLevel(raw: RawFacebookProduct): InventoryLevel {
  const available = raw.inventory ?? 0

  return {
    id: `${raw.id}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.id,
    locationId: DEFAULT_LOCATION_ID,
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
