/**
 * Square Location → canonical Location.
 *
 * Square Locations are rich objects with address, coordinates, phone,
 * timezone, business hours, and status. This is the first adapter to
 * fully exercise the canonical Location schema with real multi-location
 * data.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawSquareAddress {
  address_line_1?: string
  address_line_2?: string
  locality?: string
  administrative_district_level_1?: string
  postal_code?: string
  country?: string
}

export interface RawSquareCoordinates {
  latitude?: number
  longitude?: number
}

export interface RawSquareLocation {
  id: string
  name?: string
  status?: string // ACTIVE | INACTIVE
  address?: RawSquareAddress | null
  coordinates?: RawSquareCoordinates | null
  phone_number?: string | null
  timezone?: string | null
  business_hours?: Record<string, unknown> | null
  type?: string // PHYSICAL | MOBILE
  description?: string | null
  merchant_id?: string
  country?: string
  language_code?: string
  currency?: string
  created_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSquareAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_line_1 ?? undefined
  const line2 = raw.address_line_2 ?? undefined
  const city = raw.locality ?? undefined
  const region = raw.administrative_district_level_1 ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawSquareLocation): Location {
  return {
    id: raw.id,
    name: raw.name ?? '',
    active: raw.status === 'ACTIVE',
    address: mapAddress(raw.address),
    phone: raw.phone_number ?? undefined,
    isFulfillmentCenter: raw.type === 'PHYSICAL' ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Location → Square location body for create/update. */
export function untransformLocation(location: Partial<Location>): Record<string, unknown> {
  return {
    name: location.name,
    status: location.active === false ? 'INACTIVE' : 'ACTIVE',
    address: location.address
      ? {
          address_line_1: location.address.line1,
          address_line_2: location.address.line2,
          locality: location.address.city,
          administrative_district_level_1: location.address.region,
          postal_code: location.address.postalCode,
          country: location.address.country,
        }
      : undefined,
    phone_number: location.phone,
  }
}
