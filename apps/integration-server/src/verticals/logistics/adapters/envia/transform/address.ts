import type { Address } from '../../../schema/shared'

/**
 * Envia address object — used in both origin/destination for ship/rate and
 * ship/generate requests as well as in the Queries API responses.
 */
export interface EnviaAddress {
  name?: string | null
  company?: string | null
  phone?: string | null
  email?: string | null
  street?: string | null
  number?: string | null
  district?: string | null
  reference?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: EnviaAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    // Envia uses "street" and optionally "number" for the street address
    street1: raw.street ? [raw.street, raw.number].filter(Boolean).join(' ') : undefined,
    street2: raw.district ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
