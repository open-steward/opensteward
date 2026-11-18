/**
 * Bagy synthetic Location.
 *
 * Bagy does not expose a locations / warehouses API. All stock is managed at
 * a single virtual location per store. We return a synthetic "default"
 * location so callers can enumerate locations without error.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(apiAddress: string): Location {
  return {
    id: 'default',
    name: 'Default Location',
    active: true,
    isFulfillmentCenter: true,
    metadata: { apiAddress, synthetic: true } as Record<string, unknown>,
  }
}
