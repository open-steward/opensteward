/**
 * VTEX Warehouse (Logistics) → canonical Location.
 *
 * VTEX models physical storage as Warehouses under the Logistics API. Each
 * warehouse maps to the canonical Location type with `isFulfillmentCenter: true`.
 *
 * Endpoint: GET /api/logistics/pvt/configuration/warehouses
 *
 * Docs: https://developers.vtex.com/docs/api-reference/logistics-api
 */

import type { Location } from '../../../schema/location'

// ── Raw VTEX shapes ──────────────────────────────────────────────────────────

export interface RawVtexWarehouseAddress {
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  country?: RawVtexWarehouseCountry | null
  postalCode?: string | null
  location?: { latitude?: number | null; longitude?: number | null } | null
}

export interface RawVtexWarehouseCountry {
  id?: string | null
  name?: string | null
  acronym?: string | null
}

export interface RawVtexWarehouse {
  id: string
  name: string
  isActive?: boolean
  priority?: number | null
  warehouseAddress?: RawVtexWarehouseAddress | null
  pickupPoint?: boolean
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawVtexWarehouse): Location {
  const addr = raw.warehouseAddress
  let address: Location['address'] | undefined
  if (addr) {
    const streetParts = [addr.street, addr.number].filter(Boolean)
    const line1 = streetParts.length > 0 ? streetParts.join(', ') : undefined
    address = {
      line1,
      line2: addr.complement ?? undefined,
      city: addr.city ?? undefined,
      region: addr.state ?? undefined,
      postalCode: addr.postalCode ?? undefined,
      country: addr.country?.acronym ?? addr.country?.id ?? undefined,
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    active: raw.isActive !== false,
    isFulfillmentCenter: true,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
