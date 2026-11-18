/**
 * Synthetic Location for Trendyol.
 *
 * Trendyol does not expose a multi-location concept — sellers ship from
 * registered addresses on their Trendyol account. We expose a single
 * synthetic "default" location so the canonical REST surface stays
 * consistent with platforms that do model locations.
 *
 * Seller shipping addresses can be retrieved from:
 *   GET /integration/sellers/{sellerId}/addresses
 * but there is no location-based inventory split. For now we expose only
 * a single synthetic location.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(supplierId: string): Location {
  return {
    id: 'default',
    name: `Trendyol Seller ${supplierId}`,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Trendyol has no native multi-location inventory',
      supplierId,
    },
  }
}
