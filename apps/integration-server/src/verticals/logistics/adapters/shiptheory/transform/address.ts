import type { Address } from '../../../schema/shared'

export interface ShiptheoryAddress {
  firstname?: string | null
  lastname?: string | null
  company?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  address_line_3?: string | null
  city?: string | null
  county?: string | null
  postcode?: string | null
  country?: string | null
  telephone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: ShiptheoryAddress): Address {
  const firstName = raw.firstname ?? ''
  const lastName = raw.lastname ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    name: fullName,
    company: raw.company ?? undefined,
    street1: raw.address_line_1 ?? undefined,
    street2: raw.address_line_2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.county ?? undefined,
    postalCode: raw.postcode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.telephone ?? undefined,
    email: raw.email ?? undefined,
  }
}
