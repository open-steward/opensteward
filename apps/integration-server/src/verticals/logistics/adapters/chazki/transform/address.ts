import type { Address } from '../../../schema/shared'

/**
 * Chazki address object — used in shipments and orders.
 */
export interface ChazkiAddress {
  name?: string | null
  reference_name?: string | null
  company?: string | null
  address?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  region?: string | null
  postal_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  phone_number?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: ChazkiAddress): Address {
  return {
    name: raw.name ?? raw.reference_name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.address_line1 ?? raw.address ?? undefined,
    street2: raw.address_line2 ?? undefined,
    city: raw.city ?? raw.district ?? undefined,
    state: raw.state ?? raw.region ?? undefined,
    postalCode: raw.postal_code ?? raw.zip ?? undefined,
    country: raw.country_code ?? raw.country ?? undefined,
    phone: raw.phone ?? raw.phone_number ?? undefined,
    email: raw.email ?? undefined,
  }
}
