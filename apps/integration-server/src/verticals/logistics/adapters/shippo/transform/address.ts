import type { Address } from '../../../schema/shared'

export interface ShippoAddress {
  object_id: string
  object_created: string
  object_updated: string
  object_owner: string
  name: string | null
  company: string | null
  street1: string | null
  street2: string | null
  street3: string | null
  street_no: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  phone: string | null
  email: string | null
  is_residential: boolean | null
  is_complete: boolean | null
  metadata: string | null
  test: boolean
  [key: string]: unknown
}

export function transformAddress(raw: ShippoAddress): Address {
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
