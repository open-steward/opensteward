/**
 * fabric Location → canonical Location.
 *
 * fabric exposes warehouse/location data via `GET /v3/locations`.
 * Each location has `name`, `address`, `is_active`, `is_fulfillment_center`.
 */

import type { Location } from '../../../schema/location'

export interface RawFabricLocation {
  id: string
  name?: string
  is_active?: boolean
  is_fulfillment_center?: boolean
  phone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawFabricLocation): Location {
  return {
    id: raw.id,
    name: raw.name ?? '',
    active: raw.is_active,
    phone: raw.phone,
    isFulfillmentCenter: raw.is_fulfillment_center,
    address: raw.address
      ? {
          line1: raw.address.line1,
          line2: raw.address.line2,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.postal_code,
          country: raw.address.country,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
