/**
 * Wix business Location (Locations API) → canonical Location.
 *
 * Fields are those of the `Location` schema in Query Locations / Get Location:
 *   https://dev.wix.com/docs/api-reference/business-management/locations/query-locations.md
 *   https://dev.wix.com/docs/api-reference/business-management/locations/get-location.md
 */

import type { Location } from '../../../schema/location'

export interface RawWixLocation {
  id?: string
  name?: string
  description?: string
  /** "Whether this is the default location. There can only be one default location per site." */
  default?: boolean
  /** "Location status. Defaults to `ACTIVE`." enum: ACTIVE, INACTIVE */
  status?: string
  email?: string
  phone?: string
  address?: {
    country?: string
    subdivision?: string
    city?: string
    postalCode?: string
    streetAddress?: { number?: string; name?: string; apt?: string }
    formattedAddress?: string
  }
  /** "Whether the location is archived." */
  archived?: boolean
  locationTypes?: string[]
  [key: string]: unknown
}

function isActive(raw: RawWixLocation): boolean | undefined {
  if (raw.archived === true) return false
  if (raw.status === 'ACTIVE') return true
  if (raw.status === 'INACTIVE') return false
  return undefined
}

export function transformLocation(raw: RawWixLocation): Location {
  if (!raw.id) throw new Error('Wix location has no id')
  if (!raw.name) throw new Error(`Wix location ${raw.id} has no name`)
  const addr = raw.address
  const street = addr?.streetAddress
  const line1 = street ? [street.number, street.name].filter(Boolean).join(' ') : ''
  const address = addr
    ? {
        line1: line1 || undefined,
        line2: street?.apt || undefined,
        city: addr.city || undefined,
        region: addr.subdivision || undefined,
        postalCode: addr.postalCode || undefined,
        country: addr.country || undefined,
      }
    : undefined
  return {
    id: raw.id,
    name: raw.name,
    active: isActive(raw),
    address: address && Object.values(address).some((v) => v !== undefined) ? address : undefined,
    phone: raw.phone || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
