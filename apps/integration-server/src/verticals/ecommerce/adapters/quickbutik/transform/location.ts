/**
 * Quickbutik synthetic Location.
 *
 * Quickbutik does not expose a locations/warehouses endpoint in its REST API.
 * Stock is tracked directly on products/variants without location context.
 * We synthesise a single default location so the inventory transform has a
 * stable `locationId` to reference.
 */

import type { Location } from '../../../schema/location'
import { DEFAULT_LOCATION_ID } from './inventory'

export function syntheticDefaultLocation(): Location {
  return {
    id: DEFAULT_LOCATION_ID,
    name: 'Quickbutik Store',
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Quickbutik does not expose a locations endpoint; stock is tracked per product/variant',
    },
  }
}
