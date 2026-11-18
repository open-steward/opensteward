/**
 * Volusion Store Location → canonical Location.
 *
 * Volusion represents store locations via its /stores or /warehouses endpoint.
 * A location captures the store name and address.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawVolusionLocation {
  StoreID?: number | string | null
  LocationID?: number | string | null
  StoreName?: string | null
  Name?: string | null
  IsActive?: boolean | null
  Active?: boolean | null
  IsFulfillmentCenter?: boolean | null
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  PostalCode?: string | null
  Country?: string | null
  Phone?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawVolusionLocation): Address | undefined {
  const line1 = raw.Address1 ?? undefined
  const city = raw.City ?? undefined
  const postalCode = raw.PostalCode ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.Address2 ?? undefined,
    city,
    region: raw.State ?? undefined,
    postalCode,
    country,
  }
}

export function transformLocation(raw: RawVolusionLocation): Location {
  const id = raw.LocationID != null
    ? String(raw.LocationID)
    : raw.StoreID != null
      ? String(raw.StoreID)
      : ''
  const name = raw.StoreName ?? raw.Name ?? id
  const active =
    raw.IsActive != null ? Boolean(raw.IsActive) : raw.Active != null ? Boolean(raw.Active) : true

  return {
    id,
    name,
    active,
    address: mapAddress(raw),
    phone: raw.Phone ?? undefined,
    isFulfillmentCenter: raw.IsFulfillmentCenter != null
      ? Boolean(raw.IsFulfillmentCenter)
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
