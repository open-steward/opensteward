import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// Shiprocket GET settings/company/pickup ("Get All Pickup Locations",
// https://apidocs.shiprocket.in/). The documented "Successful Call" answer is
//   { data: { shipping_address: ShiprocketPickupAddress[], allow_more,
//             is_blackbox_seller, company_name, recent_addresses } }
// Only the fields that example shows are typed here.

export interface ShiprocketPickupAddress {
  id: number
  /** "The nickname of the new pickup location" (Add a New Pickup Location). */
  pickup_location: string | null
  /** "The shipper's name." */
  name: string | null
  email: string | null
  phone: string | null
  address: string | null
  address_2: string | null
  city: string | null
  state: string | null
  /** A country name in the documented example ("India"), not an ISO code. */
  country: string | null
  pin_code: string | null
  /** Numeric; the docs give no meaning for its values (the example shows 2). */
  status: number | null
  [key: string]: unknown
}

export interface ShiprocketPickupListResponse {
  data: {
    shipping_address: ShiprocketPickupAddress[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

const text = (v: string | null | undefined): string | undefined =>
  v == null || v === '' ? undefined : v

export function transformWarehouse(raw: ShiprocketPickupAddress): Warehouse {
  // `country` is left out: the documented value is a country name, and
  // Address.country is ISO 3166 alpha-2. `status` codes are undocumented, so
  // no isActive; the list row carries no created/updated timestamps.
  const address: Address = {
    name: text(raw.name),
    street1: text(raw.address),
    street2: text(raw.address_2),
    city: text(raw.city),
    state: text(raw.state),
    postalCode: text(raw.pin_code),
    phone: text(raw.phone),
    email: text(raw.email),
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)
  return {
    id: String(raw.id),
    name: text(raw.pickup_location),
    // The nickname is what orders reference as `pickup_location`.
    code: text(raw.pickup_location),
    address: hasAddress ? address : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
