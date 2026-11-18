/**
 * Elastic Path Location → canonical Location.
 *
 * Elastic Path has no native location/warehouse concept. We return a
 * synthetic default location (same approach as WooCommerce adapter).
 */

import type { Location } from '../../../schema/location'

export const SYNTHETIC_LOCATION_ID = 'elasticpath-default'

export function syntheticLocation(): Location {
  return {
    id: SYNTHETIC_LOCATION_ID,
    name: 'Default Location',
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Elastic Path has no native location concept',
    },
  }
}
