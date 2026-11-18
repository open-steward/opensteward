/**
 * JTL-Shop Location → canonical Location.
 *
 * JTL-Shop does not expose a native "locations" resource in its shop REST
 * API — physical warehousing is managed in JTL-Wawi (the ERP). We
 * synthesise a single default location representing the whole shop instance
 * so that the canonical `listLocations` / `getLocation` methods can still
 * return a meaningful result.
 */

import type { Location } from '../../../schema/location'

/**
 * Return a synthetic default Location for a JTL-Shop instance.
 * `siteIdentifier` is the shop base URL or any stable string that uniquely
 * identifies the shop.
 */
export function syntheticDefaultLocation(siteIdentifier: string): Location {
  return {
    id: 'default',
    name: 'JTL-Shop (default)',
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'JTL-Shop has no native locations endpoint; warehouse management is in JTL-Wawi.',
      siteIdentifier,
    },
  }
}
