import type { Address } from '../../../schema/shared'

/**
 * Raw Outvio address object as returned by the API.
 */
export interface OutvioAddress {
  name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: OutvioAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.province ?? undefined,
    postalCode: raw.zip ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}
