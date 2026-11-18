import type { Address } from '../../../schema/shared'

/**
 * Raw address object as returned by the GIG Logistics API.
 * GIGL uses Nigerian address conventions; state/LGA/area fields are common.
 */
export interface GigAddress {
  name?: string | null
  companyName?: string | null
  phoneNumber?: string | null
  email?: string | null
  address?: string | null          // street line 1
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: GigAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.companyName ?? undefined,
    street1: raw.address ?? undefined,
    street2: raw.addressLine2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    email: raw.email ?? undefined,
  }
}
