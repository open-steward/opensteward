import type { Address } from '../../../schema/shared'

export interface SSAddress {
  name: string | null
  company: string | null
  street1: string | null
  street2: string | null
  street3: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  residential: boolean | null
  addressVerified: string | null
  [key: string]: unknown
}

export function transformAddress(raw: SSAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street1 ?? undefined,
    street2: raw.street2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
  }
}
