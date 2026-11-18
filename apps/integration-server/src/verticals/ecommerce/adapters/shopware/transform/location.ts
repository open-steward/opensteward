/**
 * Shopware 6 does not have a multi-warehouse location concept in the
 * core API. We synthesize a single default location so the interface
 * contract is satisfied. Extensions (like Pickware) add warehouse
 * support but are not part of the core Admin API.
 */

import type { Location } from '../../../schema/location'

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
    address: raw.street || raw.city
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
