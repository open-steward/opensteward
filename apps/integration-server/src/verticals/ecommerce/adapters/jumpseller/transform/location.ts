/**
 * Jumpseller Stock Location → canonical Location.
 *
 * Jumpseller's multi-location inventory exposes stock locations via the
 * product's `stock_locations` array (per-product/variant) and a separate
 * store-level endpoint. We treat each stock location as a canonical Location.
 *
 * Docs: https://jumpseller.com/support/multi-location-inventory/
 */

import type { Location } from '../../../schema/location'

export interface RawJumpsellerLocation {
  id: number | string
  name: string
  address?: string | null
  city?: string | null
  country?: string | null
  country_code?: string | null
  region?: string | null
  postal?: string | null
  active?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawJumpsellerLocation): Location {
  const hasAddress = raw.address || raw.city || raw.postal || raw.country
  return {
    id: String(raw.id),
    name: raw.name,
    active: raw.active !== false,
    address: hasAddress
      ? {
          line1: raw.address ?? undefined,
          city: raw.city ?? undefined,
          region: raw.region ?? undefined,
          postalCode: raw.postal ?? undefined,
          country: raw.country_code ?? raw.country ?? undefined,
        }
      : undefined,
    isFulfillmentCenter: raw.active !== false ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
