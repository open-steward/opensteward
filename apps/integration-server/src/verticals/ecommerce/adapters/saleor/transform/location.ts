/**
 * Saleor Warehouse → canonical Location.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawSaleorWarehouse {
  id: string
  name: string
  isPrivate?: boolean
  address?: {
    streetAddress1?: string | null
    streetAddress2?: string | null
    city?: string | null
    countryArea?: string | null
    postalCode?: string | null
    country?: { code?: string; country?: string } | null
    phone?: string | null
  } | null
  [key: string]: unknown
}

function mapAddress(raw: RawSaleorWarehouse['address']): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.streetAddress1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.country?.code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.streetAddress2 ?? undefined,
    city,
    region: raw.countryArea ?? undefined,
    postalCode,
    country,
  }
}

export function transformLocation(raw: RawSaleorWarehouse): Location {
  return {
    id: raw.id,
    name: raw.name,
    active: true,
    address: mapAddress(raw.address),
    phone: raw.address?.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformLocation(location: Partial<Location>): Record<string, unknown> {
  return {
    name: location.name,
    address: location.address
      ? {
          streetAddress1: location.address.line1,
          streetAddress2: location.address.line2,
          city: location.address.city,
          countryArea: location.address.region,
          postalCode: location.address.postalCode,
          country: location.address.country,
        }
      : undefined,
  }
}
