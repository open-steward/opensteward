/**
 * Lightspeed Retail Shop → canonical Location.
 *
 * Lightspeed R-Series calls locations "Shops". Each shop has a name,
 * address, phone, and contact info.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawLightspeedContact {
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export interface RawLightspeedShop {
  shopID: string
  name?: string
  contact?: RawLightspeedContact
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  phone?: string
  timeZone?: string
  timeStamp?: string
  [key: string]: unknown
}

function mapAddress(raw: RawLightspeedShop): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawLightspeedShop): Location {
  return {
    id: raw.shopID,
    name: raw.name ?? '',
    active: true,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Location → Lightspeed Shop body. */
export function untransformLocation(
  location: Partial<Location>,
): Record<string, unknown> {
  return {
    name: location.name,
    address1: location.address?.line1,
    address2: location.address?.line2,
    city: location.address?.city,
    state: location.address?.region,
    zip: location.address?.postalCode,
    country: location.address?.country,
    phone: location.phone,
  }
}
