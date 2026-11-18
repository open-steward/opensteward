/**
 * Shoplazza Location → canonical Location.
 *
 * Shoplazza v2025-06 added dedicated location endpoints as part of the
 * inventory overhaul:
 *   GET /openapi/2025-06/locations
 *   GET /openapi/2025-06/locations/{location_id}
 *
 * Address fields follow the standard pattern (address1, city, province/zip,
 * country_code). Shoplazza does not expose a distinct fulfillment-centre flag.
 *
 * Docs: https://www.shoplazza.dev/api/changelog (v202506 inventory section)
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawShoplazzaLocation {
  id: number | string
  name: string
  active?: boolean
  address1?: string | null
  address2?: string | null
  city?: string | null
  zip?: string | null
  province?: string | null
  province_code?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawShoplazzaLocation): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.province ?? raw.province_code ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawShoplazzaLocation): Location {
  return {
    id: String(raw.id),
    name: raw.name,
    active: raw.active,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: raw.active !== false ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
