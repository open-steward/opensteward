/**
 * Bold Checkout Admin warehouse (+ its zone) → canonical Location.
 *
 * Shapes from https://developer.boldcommerce.com/api/checkout-admin.openapi.yaml:
 * `WarehouseConfig` ("Encapsulates the physical address of a warehouse.") has
 * an address and a `zone_id` ("The Bold-generated ID of the zone associated
 * with this warehouse.") but no id or name of its own. `ZoneConfig` carries
 * the `name` ("A user-friendly name for the zone."), and "Each warehouse must
 * belong to an existing warehouse zone, and a zone can have only one
 * warehouse", so the zone id identifies the warehouse and the zone names it.
 */
import type { Location } from '../../../schema/location'
import { alpha2, compactAddress } from '../fields'

export interface RawBoldWarehouse {
  address?: string
  address2?: string | null
  city?: string
  province_code?: string | null
  province?: string | null
  country_code?: string
  country?: string
  postal_code?: string
  extended_postal_code?: string | null
  zone_id: number
  [key: string]: unknown
}

export interface RawBoldZone {
  id: number
  name?: string
  type?: string
  default?: boolean
  enabled?: boolean
  [key: string]: unknown
}

export function transformWarehouse(warehouse: RawBoldWarehouse, zone: RawBoldZone): Location {
  if (!zone.name) throw new Error(`Bold zone ${zone.id} has no name`)
  const out: Location = {
    id: String(warehouse.zone_id),
    name: zone.name,
    metadata: { warehouse: { ...warehouse }, zone: { ...zone } },
  }
  const address = compactAddress({
    line1: warehouse.address,
    line2: warehouse.address2 ?? undefined,
    city: warehouse.city,
    region: warehouse.province_code ?? undefined,
    postalCode: warehouse.postal_code,
    country: alpha2(warehouse.country_code),
  })
  if (address) out.address = address
  return out
}
