/**
 * Synthetic Location for nopCommerce.
 *
 * nopCommerce supports warehouses (multi-location), but the Web API
 * plugin does not expose a warehouses endpoint in the standard REST API.
 * We expose a single synthetic "default" location so the canonical REST
 * surface stays consistent with platforms that do model locations.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(host: string): Location {
  return {
    id: 'default',
    name: host,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'nopCommerce Web API does not expose warehouse endpoints',
      host,
    },
  }
}
