/**
 * Synthetic Location for OpenCart.
 *
 * OpenCart has no native multi-location concept — the store itself is
 * the single fulfillment origin. We expose a single synthetic "default"
 * location so the canonical REST surface stays consistent with platforms
 * that do model locations.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(site: string): Location {
  return {
    id: 'default',
    name: site,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'OpenCart has no native multi-location',
      site,
    },
  }
}
