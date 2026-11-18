/**
 * Epos Now Location -> canonical Location.
 *
 * Epos Now locations represent physical venues / stores. Each location
 * may contain multiple devices (tills).
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawEposNowLocation {
  Id?: number
  Name?: string
  AddressLine1?: string
  AddressLine2?: string
  City?: string
  County?: string
  PostCode?: string
  Country?: string
  PhoneNumber?: string
  Active?: boolean
  [key: string]: unknown
}

function mapAddress(raw: RawEposNowLocation): Address | undefined {
  const line1 = raw.AddressLine1 ?? undefined
  const line2 = raw.AddressLine2 ?? undefined
  const city = raw.City ?? undefined
  const region = raw.County ?? undefined
  const postalCode = raw.PostCode ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawEposNowLocation): Location {
  return {
    id: String(raw.Id ?? ''),
    name: raw.Name ?? '',
    active: raw.Active ?? true,
    address: mapAddress(raw),
    phone: raw.PhoneNumber ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
