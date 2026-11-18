import type { Address } from '../../../schema/shared'

export interface InnoshipAddress {
  name?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  address1?: string | null
  address2?: string | null
  zipCode?: string | null
  city?: string | null
  county?: string | null
  countryCode?: string | null
  companyName?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: InnoshipAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    name: raw.contactPerson ?? raw.name ?? undefined,
    company: raw.companyName ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.county ?? undefined,
    postalCode: raw.zipCode ?? undefined,
    country: raw.countryCode ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
