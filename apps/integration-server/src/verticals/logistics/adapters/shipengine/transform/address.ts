import type { Address } from '../../../schema/shared'

export interface ShipEngineAddress {
  name?: string | null
  company_name?: string | null
  address_line1?: string | null
  address_line2?: string | null
  address_line3?: string | null
  city_locality?: string | null
  state_province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: ShipEngineAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.company_name ?? undefined,
    street1: raw.address_line1 ?? undefined,
    street2: raw.address_line2 ?? raw.address_line3 ?? undefined,
    city: raw.city_locality ?? undefined,
    state: raw.state_province ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country: raw.country_code ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
