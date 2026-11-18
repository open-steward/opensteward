/**
 * ikas StockLocation → canonical Location.
 *
 * ikas exposes stock locations as part of the inventory / products API.
 * Each location has an id, name, and address information.
 *
 * Docs: https://ikas.dev/docs/api/admin-api/products
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasStockLocationAddress {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: { name?: string } | null
  state?: { name?: string } | null
  country?: { name?: string; iso2?: string; code?: string } | null
  postalCode?: string | null
  [key: string]: unknown
}

export interface RawIkasStockLocation {
  id: string
  name: string
  isActive?: boolean | null
  address?: RawIkasStockLocationAddress | null
  phone?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawIkasStockLocationAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? undefined
  const city = raw.city?.name ?? undefined
  const country = raw.country?.iso2 ?? raw.country?.code ?? raw.country?.name ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.addressLine2 ?? undefined,
    city,
    region: raw.state?.name ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawIkasStockLocation): Location {
  return {
    id: raw.id,
    name: raw.name,
    active: raw.isActive ?? undefined,
    address: mapAddress(raw.address),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: raw.isActive !== false ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
