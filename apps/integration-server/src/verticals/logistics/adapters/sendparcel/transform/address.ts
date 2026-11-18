import type { Address } from '../../../schema/shared'

/**
 * SendParcel address object as returned by the REST API.
 */
export interface SendParcelAddress {
  name?: string | null
  company?: string | null
  street?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: SendParcelAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
