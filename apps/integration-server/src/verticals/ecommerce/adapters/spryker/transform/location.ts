/**
 * Spryker does not expose a Locations resource on the Storefront Glue API.
 *
 * This file provides a minimal stub so the adapter can return an empty list
 * for `listLocations` without a type error. A location with id "default" is
 * synthesised when a concrete location response is not available.
 */

import type { Location } from '../../../schema/location'

/**
 * Build a synthetic default location for Spryker stores that do not expose
 * warehouse information via the Glue API.
 */
export function buildDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Default Warehouse',
    active: true,
    isFulfillmentCenter: true,
    metadata: {},
  }
}
