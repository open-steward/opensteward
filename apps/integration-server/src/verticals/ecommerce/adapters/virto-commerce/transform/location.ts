/**
 * Virto Commerce FulfillmentCenter → canonical Location.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Inventory/swagger.json` →
 * `components.schemas.FulfillmentCenter` / `InventoryAddress`.
 * `FulfillmentCenter` has no active/enabled flag of its own, so canonical
 * `active` is left unset rather than assumed true.
 */
import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawVirtoAddress {
  line1?: string
  line2?: string
  city?: string
  regionName?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  [key: string]: unknown
}

export interface RawVirtoFulfillmentCenter {
  id: string
  name: string
  description?: string
  address?: RawVirtoAddress
  outerId?: string
  organizationId?: string
  [key: string]: unknown
}

function address(raw: RawVirtoAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.regionName,
    postalCode: raw.postalCode,
    country: raw.countryCode,
  }
}

export function transformLocation(raw: RawVirtoFulfillmentCenter): Location {
  return {
    id: raw.id,
    name: raw.name,
    address: address(raw.address),
    phone: raw.address?.phone,
    isFulfillmentCenter: true,
    metadata: { ...raw },
  }
}
