import type { Warehouse } from '../../../schema/warehouse'

/**
 * Raw pickup location object returned by the Cargus API.
 * Documented under section 5 — Pick up points.
 * Endpoints: GET /PickupLocations, GET /PickupLocations/GetForClient
 *
 * In Cargus the pickup location is the customer's sender depot — the closest
 * concept to a canonical Warehouse.
 */
export interface CargusPickupLocation {
  LocationId?: number | string | null
  Name?: string | null
  CountyId?: number | null
  CountyName?: string | null
  LocalityId?: number | null
  LocalityName?: string | null
  StreetId?: number | null
  StreetName?: string | null
  BuildingNumber?: string | null
  AddressText?: string | null
  ContactPerson?: string | null
  PhoneNumber?: string | null
  Email?: string | null
  CodPostal?: string | null
  AutomaticEOD?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: CargusPickupLocation): Warehouse {
  // Build a best-effort street line from StreetName + BuildingNumber.
  const street1Parts = [raw.StreetName, raw.BuildingNumber].filter(Boolean)
  const street1 = street1Parts.length > 0 ? street1Parts.join(' ') : (raw.AddressText ?? undefined)

  return {
    id: raw.LocationId != null ? String(raw.LocationId) : undefined,
    name: raw.Name ?? undefined,
    address:
      street1 || raw.LocalityName || raw.CountyName || raw.CodPostal
        ? {
            name: raw.ContactPerson ?? undefined,
            street1: street1 ?? undefined,
            city: raw.LocalityName ?? undefined,
            state: raw.CountyName ?? undefined,
            postalCode: raw.CodPostal ?? undefined,
            country: 'RO',
            phone: raw.PhoneNumber ?? undefined,
            email: raw.Email ?? undefined,
          }
        : undefined,
    isActive: true,
    // AutomaticEOD carries a booking closing time (HH:MM:SS); trim to HH:MM.
    cutoffTime:
      raw.AutomaticEOD && typeof raw.AutomaticEOD === 'string'
        ? (raw.AutomaticEOD.slice(0, 5) as `${string}:${string}`)
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
