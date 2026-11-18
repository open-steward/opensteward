/**
 * Synthetic Location for Mirakl.
 *
 * Mirakl is an operator-level marketplace platform. Sellers on a Mirakl
 * marketplace do not have access to location/warehouse management through
 * the seller API — fulfillment origin is implicitly the seller's own
 * warehouse. We expose a single synthetic "default" location so the
 * canonical surface is consistent with platforms that do model locations.
 *
 * The operator base URL (e.g. https://mystore.mirakl.net) is used as the
 * display name to disambiguate connections in logs and UIs.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(baseUrl: string): Location {
  return {
    id: 'default',
    name: baseUrl,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Mirakl seller API does not expose warehouse/location resources',
      baseUrl,
    },
  }
}
