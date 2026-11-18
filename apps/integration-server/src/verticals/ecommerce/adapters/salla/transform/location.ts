/**
 * Salla Branch → canonical Location.
 *
 * Salla uses "branches" as the closest concept to store locations.
 * The branches endpoint (/admin/v2/branches) returns:
 *  - id, name, phone, address (city, country, address_details)
 *  - status (active|inactive)
 *
 * Docs: https://docs.salla.dev/endpoint-5394224
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaBranchAddress {
  city?: string | null
  country?: string | null
  country_code?: string | null
  address_details?: string | null
  postal_code?: string | null
}

export interface RawSallaBranch {
  id: number | string
  name?: string
  phone?: string | null
  address?: RawSallaBranchAddress
  status?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(addr: RawSallaBranchAddress | null | undefined): Address | undefined {
  if (!addr) return undefined
  const city = addr.city ?? undefined
  const country = addr.country_code ?? addr.country ?? undefined
  const line1 = addr.address_details ?? undefined
  const postalCode = addr.postal_code ?? undefined
  if (!city && !country && !line1) return undefined
  return { line1, city, country, postalCode }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformLocation(raw: RawSallaBranch): Location {
  return {
    id: String(raw.id),
    name: raw.name ?? String(raw.id),
    active: raw.status?.toLowerCase() === 'active' ? true : undefined,
    address: mapAddress(raw.address),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Return a synthetic default location for stores that have no branches
 * configured.
 */
export function syntheticDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Default Location',
    active: true,
    isFulfillmentCenter: true,
    metadata: { synthetic: true },
  }
}
