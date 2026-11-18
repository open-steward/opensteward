/**
 * SAP Commerce Cloud PointOfService → canonical Location.
 *
 * SAP Commerce exposes physical store locations as "Points of Service"
 * (PoS) via `/stores` or `/pointofservices` endpoints. These map to
 * the canonical Location type representing inventory/fulfillment
 * locations.
 */

import type { Location } from '../../../schema/location'

export interface RawSapPointOfService {
  name?: string
  displayName?: string
  description?: string
  address?: {
    line1?: string
    line2?: string
    town?: string
    region?: { isocode?: string; name?: string }
    postalCode?: string
    country?: { isocode?: string; name?: string }
    phone?: string
    email?: string
  }
  geoPoint?: { latitude?: number; longitude?: number }
  storeContent?: string
  openingHours?: unknown
  features?: Record<string, string>
  warehouseCodes?: string[]
  [key: string]: unknown
}

export function transformLocation(raw: RawSapPointOfService): Location {
  return {
    id: raw.name ?? '',
    name: raw.displayName ?? raw.name ?? '',
    active: true,
    address: raw.address
      ? {
          line1: raw.address.line1,
          line2: raw.address.line2,
          city: raw.address.town,
          region: raw.address.region?.isocode ?? raw.address.region?.name,
          postalCode: raw.address.postalCode,
          country: raw.address.country?.isocode ?? raw.address.country?.name,
        }
      : undefined,
    phone: raw.address?.phone,
    isFulfillmentCenter: (raw.warehouseCodes?.length ?? 0) > 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
