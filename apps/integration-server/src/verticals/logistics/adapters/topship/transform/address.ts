import type { Address } from '../../../schema/shared'

export interface TopshipAddress {
  name?: string | null
  email?: string | null
  phoneNumber?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressLine3?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  countryCode?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: TopshipAddress): Address {
  return {
    name: raw.name ?? undefined,
    street1: raw.addressLine1 ?? undefined,
    street2: raw.addressLine2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? raw.countryCode ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    email: raw.email ?? undefined,
  }
}
