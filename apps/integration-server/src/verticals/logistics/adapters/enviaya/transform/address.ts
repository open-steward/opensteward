import type { Address } from '../../../schema/shared'

export interface EnviaYaDirection {
  full_name?: string | null
  company?: string | null
  direction_1?: string | null
  direction_2?: string | null
  city?: string | null
  state_code?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  email?: string | null
  neighborhood?: string | null
  latitude?: number | null
  longitude?: number | null
  [key: string]: unknown
}

export function transformDirection(raw: EnviaYaDirection | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.full_name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.direction_1 ?? undefined,
    street2: raw.direction_2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state_code ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country: raw.country_code ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}
