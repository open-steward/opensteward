import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

export interface AymakanDropoffLocationRaw {
  name?: string | null
  city?: string | null
  address?: string | null
  manager?: string | null
  mobile_phone?: string | null
  email?: string | null
  location_lat?: number | string | null
  location_lng?: number | string | null
  [key: string]: unknown
}

export interface AymakanDropoffLocationsResponse {
  success?: boolean
  data?: AymakanDropoffLocationRaw[]
  [key: string]: unknown
}

/**
 * Transform an Aymakan dropoff location record (GET /dropoff_locations)
 * into a canonical Warehouse.  Dropoff locations are the closest concept
 * Aymakan exposes — they are physical collection points with an address.
 */
export function transformWarehouse(raw: AymakanDropoffLocationRaw): Warehouse {
  const address: Address | undefined =
    raw.address || raw.city
      ? {
          name: raw.name ?? undefined,
          street1: raw.address ?? undefined,
          city: raw.city ?? undefined,
          phone: raw.mobile_phone ?? undefined,
          email: raw.email ?? undefined,
        }
      : undefined

  return {
    name: raw.name ?? undefined,
    address,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
