/**
 * Shopgate Location → canonical Location.
 *
 * Shopgate locations are physical store or warehouse locations managed via the
 * Location Service. They are identified by a `code` string.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateLocation {
  code: string
  name?: string
  isActive?: boolean
  isFulfillmentLocation?: boolean
  latitude?: number | null
  longitude?: number | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  countryCode?: string | null
  country?: string | null
  phone?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawShopgateLocation): Address | undefined {
  const line1 = raw.street1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawShopgateLocation): Location {
  return {
    id: raw.code,
    name: raw.name ?? raw.code,
    active: raw.isActive,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: raw.isFulfillmentLocation,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
