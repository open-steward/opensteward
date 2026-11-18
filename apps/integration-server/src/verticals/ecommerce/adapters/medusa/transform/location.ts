/**
 * Medusa v2 Stock Location → canonical Location.
 *
 * Medusa v2 has a dedicated stock-locations module with address support.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawMedusaStockLocationAddress {
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawMedusaStockLocation {
  id: string
  name: string
  address?: RawMedusaStockLocationAddress | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawMedusaStockLocationAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address_2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

export function transformLocation(raw: RawMedusaStockLocation): Location {
  return {
    id: raw.id,
    name: raw.name,
    active: true,
    address: mapAddress(raw.address),
    phone: raw.address?.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformLocation(location: Partial<Location>): Record<string, unknown> {
  return {
    name: location.name,
    address: location.address
      ? {
          address_1: location.address.line1,
          address_2: location.address.line2,
          city: location.address.city,
          province: location.address.region,
          postal_code: location.address.postalCode,
          country_code: location.address.country,
        }
      : undefined,
  }
}
