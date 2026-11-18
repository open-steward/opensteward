/**
 * Synthetic Location for Recharge.
 *
 * Recharge has no native multi-location concept — it is a subscription
 * billing layer on top of an ecommerce platform rather than a warehouse
 * management system. We expose a single synthetic "default" location so the
 * canonical REST surface stays consistent with platforms that do model
 * locations (e.g. Shopify).
 */

import type { Location } from '../../../schema/location'

export function syntheticDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Recharge (default)',
    active: true,
    isFulfillmentCenter: false,
    metadata: {
      synthetic: true,
      reason: 'Recharge has no native multi-location support',
    },
  }
}
