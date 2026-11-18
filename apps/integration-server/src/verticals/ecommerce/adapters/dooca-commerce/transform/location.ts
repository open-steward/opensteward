/**
 * Dooca Commerce synthetic default Location.
 *
 * Dooca Commerce does not have a native multi-location model. Stock is
 * tracked directly on product variations. We return a single synthetic
 * default location so the canonical inventory methods have a location
 * anchor to bind to.
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Default Location',
    active: true,
    isFulfillmentCenter: true,
    metadata: {},
  }
}
