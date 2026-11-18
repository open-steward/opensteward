/**
 * Shopware B2B Suite location transform.
 *
 * Shopware core and the B2B Suite have no dedicated multi-warehouse entity in
 * the Admin API. All stock is tracked at the product level (a single implicit
 * warehouse). We synthesize a canonical Location record so the interface
 * contract is satisfied.
 *
 * The Shopware "Multi-Inventory" extension (Shopware Beyond licence) adds
 * /api/warehouse, but that is a separate commercial plugin and is NOT part
 * of the B2B Suite. This adapter therefore derives a single default location
 * from the product-stock implicit warehouse.
 */

import type { Location } from '../../../schema/location'

/** Shape used if a third-party warehouse extension is available. */
export interface RawShopwareWarehouse {
  id: string
  name: string
  active?: boolean
  street?: string
  city?: string
  zipcode?: string
  country?: { iso?: string; name?: string } | null
  phone?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawShopwareWarehouse): Location {
  return {
    id: raw.id,
    name: raw.name,
    active: raw.active,
    address:
      raw.street || raw.city
        ? {
            line1: raw.street,
            city: raw.city,
            postalCode: raw.zipcode,
            country: raw.country?.iso ?? raw.country?.name,
          }
        : undefined,
    phone: raw.phone,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}

/** Returns the single synthetic default location for stores without Multi-Inventory. */
export function syntheticDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Default Warehouse',
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason:
        'Shopware B2B Suite has no dedicated warehouse entity in the core Admin API. ' +
        'Multi-Inventory (/api/warehouse) requires the separate Shopware Beyond licence.',
    },
  }
}
