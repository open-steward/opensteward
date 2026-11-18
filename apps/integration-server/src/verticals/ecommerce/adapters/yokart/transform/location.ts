/**
 * Synthetic Location for Yo!Kart.
 *
 * Yo!Kart has no native multi-location inventory concept — the store itself
 * is the single fulfillment origin. We expose one synthetic "default"
 * location so the canonical REST surface stays consistent with platforms
 * that do model locations (e.g. Shopify). The store site URL is used as the
 * display name so callers can distinguish connections in logs and UIs.
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
      reason: 'Yo!Kart has no native multi-location inventory',
      site,
    },
  }
}
