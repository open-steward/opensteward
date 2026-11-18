/**
 * Synthetic Location for Ecwid.
 *
 * Ecwid has no native multi-location concept — the store itself is the
 * single fulfillment origin. We expose a single synthetic "default"
 * location so the canonical REST surface stays consistent with platforms
 * that do model locations.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(storeId: string): Location {
  return {
    id: 'default',
    name: `Ecwid Store ${storeId}`,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Ecwid has no native multi-location',
      storeId,
    },
  }
}
