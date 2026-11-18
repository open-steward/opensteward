import type { Address } from '../../../schema/shared'

/**
 * Shipium address object — used in both shipmentParameters and responses.
 */
export interface ShipiumAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  email?: string | null
  addressType?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: ShipiumAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street1 ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: (raw.countryCode ?? undefined) as Address['country'],
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}

export function toShipiumAddress(addr: Address | undefined): ShipiumAddress | undefined {
  if (!addr) return undefined
  return {
    name: addr.name,
    company: addr.company,
    street1: addr.street1,
    street2: addr.street2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    countryCode: addr.country,
    phone: addr.phone,
    email: addr.email,
    addressType: 'commercial',
  }
}
