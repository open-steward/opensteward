/**
 * Haravan Location → canonical Location.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/location/
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawHaravanLocation {
  id: number | string
  name: string
  location_type?: string | null
  address1?: string | null
  address2?: string | null
  zip?: string | null
  city?: string | null
  province?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawHaravanLocation): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2: raw.address2 ?? undefined, city, region: raw.province ?? undefined, postalCode, country }
}

export function transformLocation(raw: RawHaravanLocation): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    // `location_type` is documented as "default" (main warehouse) or
    // "ontheroad" (transit warehouse); only the latter is not a fulfillment
    // centre. Absent → leave undefined rather than guessing.
    isFulfillmentCenter:
      raw.location_type === 'ontheroad'
        ? false
        : raw.location_type === 'default'
          ? true
          : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
