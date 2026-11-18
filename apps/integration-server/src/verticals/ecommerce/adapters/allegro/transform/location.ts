/**
 * Allegro point of service → canonical Location.
 *
 * Source, per https://developer.allegro.pl/swagger.yaml:
 *   GET /points-of-service?seller.id=… (getPOSListUsingGET) → `{ posList: Pos[] }`
 *   GET /points-of-service/{id}       (getPOSDataUsingGET) → `Pos`
 *
 * Pos (required: address, confirmationType, name, openHours, status, type):
 *   - `id`      "UUID. When creating a point of service (Post) the field is
 *               ignored."
 *   - `status`  "Point of service status: ACTIVE - active, TEMPORARILY_CLOSED
 *               - temporarily closed, CLOSED_DOWN - closed down, DELETED -
 *               deleted."
 *   - `address` `{ street, city, zipCode, state, countryCode, coordinates }`
 *   - `phoneNumber`
 */

import type { Location } from '../../../schema/location'

export interface RawAllegroPosAddress {
  street?: string
  city?: string
  zipCode?: string
  state?: string
  countryCode?: string
  coordinates?: { lat?: number; lon?: number }
}

export interface RawAllegroPointOfService {
  id?: string
  externalId?: string
  name: string
  type?: string
  status?: string
  phoneNumber?: string
  email?: string
  address?: RawAllegroPosAddress
  [key: string]: unknown
}

export function transformLocation(raw: RawAllegroPointOfService): Location {
  if (!raw.id) {
    throw new Error('Allegro point of service carries no id; cannot map it to a Location')
  }
  const addr = raw.address
  return {
    id: raw.id,
    name: raw.name,
    active: raw.status === 'ACTIVE',
    address: addr
      ? {
          line1: addr.street,
          city: addr.city,
          postalCode: addr.zipCode,
          region: addr.state,
          country: addr.countryCode,
        }
      : undefined,
    phone: raw.phoneNumber,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
