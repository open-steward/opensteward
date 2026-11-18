/**
 * OTTO Market return-warehouse address → canonical Location.
 *
 * OTTO Market has no seller-facing warehouse/fulfillment-center resource —
 * shipping profiles are shipping CONFIG (processing time, cutoffs), not
 * locations. `/v2/returns-warehouse/addresses` is the one genuinely
 * location-shaped resource: a physical address customers ship returns back
 * to. Its confirmed fields are `returnAddressId` (uuid4) and
 * `returnWarehouseType` (NATIONAL | INTERNATIONAL |
 * INTERNATIONAL_CONSOLIDATION_HUB); the full street/city/zip/name field
 * names are not shown with a worked JSON example on the public docs page,
 * so this transform reads them defensively and always keeps the untouched
 * response in `metadata`.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/returns-warehouse
 *       https://api.otto.market/docs/functional-interfaces/shipping-profiles
 *       (confirms shipping profiles are NOT a location resource)
 */

import type { Location } from '../../../schema/location'

export interface RawOttoReturnAddress {
  returnAddressId: string
  returnWarehouseType?: string
  name?: string
  label?: string
  street?: string
  houseNumber?: string
  zipCode?: string
  postalCode?: string
  city?: string
  country?: string
  countryCode?: string
  [key: string]: unknown
}

const ALPHA2 = /^[A-Za-z]{2}$/

function pickCountry(raw: RawOttoReturnAddress): string | undefined {
  const candidate = raw.countryCode ?? raw.country
  return candidate && ALPHA2.test(candidate) ? candidate.toUpperCase() : undefined
}

function pickLine1(raw: RawOttoReturnAddress): string | undefined {
  const parts = [raw.street, raw.houseNumber].filter((v): v is string => Boolean(v))
  return parts.length > 0 ? parts.join(' ') : undefined
}

export function transformLocation(raw: RawOttoReturnAddress): Location {
  const name = raw.name ?? raw.label ?? raw.city ?? raw.returnAddressId

  const address = {
    line1: pickLine1(raw),
    city: raw.city,
    postalCode: raw.zipCode ?? raw.postalCode,
    country: pickCountry(raw),
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)

  return {
    id: raw.returnAddressId,
    name,
    active: true,
    address: hasAddress ? address : undefined,
    isFulfillmentCenter: false,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
