/**
 * KORONA OrganizationalUnit → canonical Location.
 *
 * Shape verified against `components.schemas.OrganizationalUnit` and
 * `AddressInformation` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 *
 * `organizationalUnits` (not `pointsOfSale`) is used because
 * `OrganizationalUnit.warehouse` is documented exactly as the canonical
 * `isFulfillmentCenter` concept: "If true, this organizational unit can
 * hold and track inventory." `pointsOfSale` has no such flag and its
 * `/productStocks` / `/stocks` nesting lives under organizational units,
 * not points of sale — confirming organizational units are the
 * stock-holding location in this API.
 *
 * `AddressInformation.country` is a bare, unformatted string in the spec
 * (no ISO enum) — it is only published when it independently validates as
 * a real ISO 3166-1 alpha-2 code, never forced.
 */

import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface KoronaAddressInformation {
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
}

export interface KoronaOrganizationalUnit {
  id: string
  number?: string
  name?: string
  active?: boolean
  warehouse?: boolean
  address?: KoronaAddressInformation
}

function mapAddress(raw: KoronaAddressInformation | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? undefined
  const line2 = raw.addressLine2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const upperCountry = raw.country?.toUpperCase()
  const country = upperCountry && isIso3166Alpha2(upperCountry) ? upperCountry : undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: KoronaOrganizationalUnit): Location {
  return {
    id: raw.id,
    name: raw.name || raw.number || raw.id,
    active: raw.active,
    address: mapAddress(raw.address),
    isFulfillmentCenter: raw.warehouse,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
