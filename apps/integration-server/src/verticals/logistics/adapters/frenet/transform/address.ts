import type { Address } from '../../../schema/shared'

/** Frenet address shape returned from shipment and order endpoints. */
export interface FrenetAddress {
  Addressee?: string | null
  Street?: string | null
  Number?: string | null
  Complement?: string | null
  Neighborhood?: string | null
  City?: string | null
  UF?: string | null        // Brazilian state abbreviation
  CEP?: string | null       // Brazilian postal code
  Country?: string | null
  Phone?: string | null
  Email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: FrenetAddress | null | undefined): Address | undefined {
  if (!raw) return undefined

  const street = [raw.Street, raw.Number, raw.Complement, raw.Neighborhood]
    .filter(Boolean)
    .join(', ') || undefined

  const addr: Address = {
    name: raw.Addressee ?? undefined,
    street1: street,
    city: raw.City ?? undefined,
    state: raw.UF ?? undefined,
    postalCode: raw.CEP ?? undefined,
    country: raw.Country ?? 'BR',
    phone: raw.Phone ?? undefined,
    email: raw.Email ?? undefined,
  }

  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}
