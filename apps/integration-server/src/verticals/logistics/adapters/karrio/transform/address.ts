import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

/**
 * Karrio `Address` (https://docs.karrio.io/reference/openapi, schema Address):
 * person_name, company_name, address_line1, address_line2, city, state_code,
 * postal_code, country_code, email, phone_number, residential.
 */
export interface KarrioAddress {
  id?: string
  postal_code?: string | null
  city?: string | null
  state_code?: string | null
  country_code?: string | null
  person_name?: string | null
  company_name?: string | null
  address_line1?: string | null
  address_line2?: string | null
  phone_number?: string | null
  email?: string | null
  residential?: boolean | null
  [key: string]: unknown
}

export function transformAddress(raw: KarrioAddress): Address {
  // Karrio's country_code enum also carries codes that are not assigned
  // ISO 3166-1 alpha-2 (e.g. `AC`, `AN`); those are omitted, never guessed.
  const country =
    raw.country_code && isIso3166Alpha2(raw.country_code) ? raw.country_code : undefined
  return {
    name: raw.person_name ?? undefined,
    company: raw.company_name ?? undefined,
    street1: raw.address_line1 ?? undefined,
    street2: raw.address_line2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state_code ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country,
    phone: raw.phone_number ?? undefined,
    email: raw.email ?? undefined,
  }
}
