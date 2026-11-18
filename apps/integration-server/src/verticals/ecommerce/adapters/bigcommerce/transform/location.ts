/**
 * BigCommerce Location → canonical Location.
 *
 * BigCommerce has an Inventory Locations API (`/v3/inventory/locations`).
 * For stores without multi-location, a synthetic default location is
 * returned by the adapter.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawBigCommerceLocation {
  id: number | string
  code?: string
  label?: string
  description?: string
  enabled?: boolean
  type_id?: string // 'PHYSICAL' | 'VIRTUAL'
  address?: {
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    country_code?: string | null
    phone?: string | null
    email?: string | null
  } | null
  [key: string]: unknown
}

function mapAddress(raw: RawBigCommerceLocation['address']): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

export function transformLocation(raw: RawBigCommerceLocation): Location {
  return {
    id: String(raw.id),
    name: raw.label ?? raw.code ?? 'Default',
    active: raw.enabled,
    address: mapAddress(raw.address),
    phone: raw.address?.phone ?? undefined,
    isFulfillmentCenter: raw.type_id === 'PHYSICAL' ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a synthetic default location for stores that don't use multi-location
 * inventory.
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
