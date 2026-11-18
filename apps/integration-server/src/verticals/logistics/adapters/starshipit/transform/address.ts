import type { Address } from '../../../schema/shared'

/**
 * Starshipit address object.
 *
 * Starshipit uses `suburb` for the city/locality field and
 * `post_code` for the postal code. The `street` field carries the
 * full street address (combined street number + name).
 */
export interface StarshipitAddress {
  name?: string | null
  phone?: string | null
  email?: string | null
  company?: string | null
  street?: string | null
  suburb?: string | null
  city?: string | null       // some responses include city in addition to suburb
  state?: string | null
  post_code?: string | null
  country?: string | null
  country_code?: string | null
  delivery_instructions?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: StarshipitAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.street ?? undefined,
    city: raw.suburb ?? raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.post_code ?? undefined,
    country: (raw.country_code ?? raw.country ?? undefined) as string | undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}
