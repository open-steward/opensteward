import type { Address } from '../../../schema/shared'

/**
 * Raw CDEK location object as returned by from_location/to_location fields.
 * CDEK uses a flat address structure with city, address, and country_code.
 */
export interface CdekLocation {
  code?: number | null
  city?: string | null
  city_uuid?: string | null
  address?: string | null
  address_full?: string | null
  country_code?: string | null
  region?: string | null
  region_code?: number | null
  postal_code?: string | null
  longitude?: number | null
  latitude?: number | null
  [key: string]: unknown
}

/**
 * Raw CDEK contact (sender/recipient) object.
 * Contacts carry the personal data while location holds the geographic address.
 */
export interface CdekContact {
  name?: string | null
  company?: string | null
  email?: string | null
  phones?: Array<{ number?: string | null }> | null
  [key: string]: unknown
}

export function transformAddress(
  location: CdekLocation | null | undefined,
  contact?: CdekContact | null,
): Address | undefined {
  if (!location && !contact) return undefined

  const phone = contact?.phones?.[0]?.number ?? undefined

  return {
    name: contact?.name ?? undefined,
    company: contact?.company ?? undefined,
    street1: location?.address ?? location?.address_full ?? undefined,
    city: location?.city ?? undefined,
    state: location?.region ?? undefined,
    postalCode: location?.postal_code ?? undefined,
    country: location?.country_code ?? undefined,
    phone: phone ?? undefined,
    email: contact?.email ?? undefined,
  }
}
