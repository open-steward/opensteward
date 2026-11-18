import type { Address } from '../../../schema/shared'

/**
 * iMile address object shape (as returned by shipment / order endpoints).
 * Field names follow iMile's documented camelCase convention.
 */
export interface IMileAddress {
  name?: string | null
  companyName?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: IMileAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.companyName ?? undefined,
    street1: raw.addressLine1 ?? undefined,
    street2: raw.addressLine2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
