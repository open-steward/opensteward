import type { Address } from '../../../schema/shared'

export interface EasyPostAddress {
  id: string
  object: 'Address'
  mode: string
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  name: string | null
  company: string | null
  phone: string | null
  email: string | null
  residential: boolean | null
  verified: boolean | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformAddress(raw: EasyPostAddress): Address {
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street1 ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zip ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}
