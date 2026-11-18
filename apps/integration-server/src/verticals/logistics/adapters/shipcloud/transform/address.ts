import type { Address } from '../../../schema/shared'

/**
 * shipcloud address object (used in both "from" and "to" fields).
 * Fields: first_name, last_name, company, care_of, street, street_no,
 *         city, zip_code, state, country, phone, email
 */
export interface ShipcloudAddress {
  id?: string | null
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  care_of?: string | null
  street?: string | null
  street_no?: string | null
  city?: string | null
  zip_code?: string | null
  state?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

/**
 * Compose a full name from first_name and last_name.
 */
function fullName(first: string | null | undefined, last: string | null | undefined): string | undefined {
  const parts = [first, last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

export function transformAddress(raw: ShipcloudAddress): Address {
  const name = fullName(raw.first_name, raw.last_name) ?? raw.company ?? undefined

  // shipcloud stores street and house number separately; combine into street1
  const streetParts = [raw.street, raw.street_no].filter(Boolean)
  const street1 = streetParts.length > 0 ? streetParts.join(' ') : undefined

  return {
    name,
    company: raw.company ?? undefined,
    street1,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zip_code ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
