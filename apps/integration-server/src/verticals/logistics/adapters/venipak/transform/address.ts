import type { Address } from '../../../schema/shared'

/**
 * Venipak address fields shared across consignor, sender, consignee, and
 * return_consignee blocks.
 */
export interface VenipakAddress {
  name?: string | null
  company_name?: string | null
  address?: string | null
  city?: string | null
  postcode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: VenipakAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    name: raw.name ?? undefined,
    company: raw.company_name ?? undefined,
    street1: raw.address ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.postcode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
