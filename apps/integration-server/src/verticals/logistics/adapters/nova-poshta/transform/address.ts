import type { Address } from '../../../schema/shared'

/**
 * Nova Poshta address shape (appears in shipment recipient/sender fields).
 */
export interface NovaPoshtaAddress {
  name?: string | null
  fullName?: string | null
  companyName?: string | null
  phone?: string | null
  email?: string | null
  street?: string | null
  streetNumber?: string | null
  flat?: string | null
  city?: string | null
  settlement?: string | null
  region?: string | null
  postalCode?: string | null
  countryCode?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: NovaPoshtaAddress): Address {
  const name = raw.fullName ?? raw.name ?? undefined
  const street1 = raw.street
    ? [raw.street, raw.streetNumber].filter(Boolean).join(' ') || undefined
    : undefined
  const street2 = raw.flat ? `Apt ${raw.flat}` : undefined

  return {
    name: name ?? undefined,
    company: raw.companyName ?? undefined,
    street1,
    street2,
    city: raw.city ?? raw.settlement ?? undefined,
    state: raw.region ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
