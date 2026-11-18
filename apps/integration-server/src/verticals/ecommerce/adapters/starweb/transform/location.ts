/**
 * Synthetic Location for Starweb.
 *
 * Starweb has no native multi-location concept — the shop itself is the
 * single fulfillment origin. We expose a single synthetic "default"
 * location so the canonical REST surface stays consistent with platforms
 * that do model locations (e.g. Shopify). The shop ID is used in the
 * display name so callers can distinguish connections in logs and UIs.
 */

import type { Location } from '../../../schema/location'

export const STARWEB_LOCATION_ID = 'default'

export function syntheticDefaultLocation(shopId: string): Location {
  return {
    id: STARWEB_LOCATION_ID,
    name: `${shopId} (Starweb)`,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Starweb has no native multi-location support',
      shopId,
    },
  }
}
