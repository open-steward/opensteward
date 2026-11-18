/**
 * Synthetic Location for PrestaShop.
 *
 * PrestaShop has no native multi-location/warehouse API in the core
 * webservice. We expose a single synthetic "default" location so the
 * canonical REST surface stays consistent.
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
      reason: 'PrestaShop has no native multi-location',
      site,
    },
  }
}
