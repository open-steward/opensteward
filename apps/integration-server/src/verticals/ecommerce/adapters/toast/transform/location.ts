/**
 * Toast Restaurants API `RestaurantInfo` → canonical Location.
 *
 * GET /restaurants/v1/restaurants/{restaurantGUID} "Returns a
 * `RestaurantInfo` object that contains detailed information about the
 * configuration of a restaurant."
 * https://doc.toasttab.com/openapi/restaurants/operation/restaurantsRestaurantGuidGet/
 *
 * `RestaurantInfo` has `guid`, `general` (`General`: `name`, `locationName`,
 * `timeZone`, `closeoutHour`, `currencyCode`, `firstBusinessDate`,
 * `archived`, ...) and `location` (`Location`: `address1`, `address2`,
 * `city`, `stateCode` (deprecated), `administrativeArea`, `zipCode`,
 * `country`, `phone`, `latitude`, `longitude`).
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'
import { isIso3166Alpha2 } from '@opensteward/shared'

export interface RawToastRestaurantLocation {
  address1?: string
  address2?: string
  city?: string
  /** Deprecated upstream in favour of `administrativeArea`. */
  stateCode?: string
  administrativeArea?: string
  zipCode?: string
  country?: string
  phone?: string
  phoneCountryCode?: string
  latitude?: number
  longitude?: number
}

export interface RawToastRestaurantGeneral {
  name?: string
  locationName?: string
  locationCode?: string
  description?: string
  timeZone?: string
  closeoutHour?: number
  managementGroupGuid?: string
  /** "The ISO-4217 currency code used in this restaurant" */
  currencyCode?: string
  /** yyyyMMdd: "the day a restaurant began using the Toast platform". */
  firstBusinessDate?: number
  archived?: boolean
}

export interface RawToastRestaurant {
  guid?: string
  general?: RawToastRestaurantGeneral
  location?: RawToastRestaurantLocation
  [key: string]: unknown
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function mapAddress(raw: RawToastRestaurantLocation | undefined): Address | undefined {
  if (!raw) return undefined
  const address: Address = {
    line1: nonEmpty(raw.address1),
    line2: nonEmpty(raw.address2),
    city: nonEmpty(raw.city),
    // "Deprecated. Get the state or province of a restaurant in the
    // `administrativeArea` value."
    region: nonEmpty(raw.administrativeArea),
    postalCode: nonEmpty(raw.zipCode),
    // "The nation of the restaurant." Kept only when it is an ISO 3166-1
    // alpha-2 code, which the canonical address requires.
    country: raw.country && isIso3166Alpha2(raw.country) ? raw.country : undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

/**
 * `restaurantGuid` is the GUID the request named in its path ("The Toast
 * GUID of the restaurant that you want to get information about."), which
 * is the restaurant this object describes.
 */
export function transformLocation(raw: RawToastRestaurant, restaurantGuid: string): Location {
  const name = raw.general?.name
  // "The guest-facing name of the restaurant." Required by the canonical
  // schema, with no other documented source.
  if (typeof name !== 'string')
    throw new Error(`Toast restaurant ${restaurantGuid} has no general.name`)
  const archived = raw.general?.archived
  return {
    id: restaurantGuid,
    name,
    active: typeof archived === 'boolean' ? !archived : undefined,
    address: mapAddress(raw.location),
    phone: nonEmpty(raw.location?.phone),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
