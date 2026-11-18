import type { Address } from '../../../schema/shared'

/**
 * Unified.to address shape used in shipment from/to/return address fields.
 * All fields are optional (open schema).
 */
export interface UnifiedAddress {
  name?: string | null
  companyName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  regionCode?: string | null
  postalCode?: string | null
  country?: string | null
  countryCode?: string | null
  telephone?: string | null
  email?: string | null
  isResidential?: boolean | null
  isValidated?: boolean | null
  deliveryInstructions?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: UnifiedAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.companyName ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.region ?? raw.regionCode ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? raw.country ?? undefined,
    phone: raw.telephone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

export function addressToUnified(addr: Address | undefined): UnifiedAddress | undefined {
  if (!addr) return undefined
  return {
    name: addr.name,
    companyName: addr.company,
    address1: addr.street1,
    address2: addr.street2,
    city: addr.city,
    region: addr.state,
    postalCode: addr.postalCode,
    countryCode: addr.country,
    telephone: addr.phone,
    email: addr.email,
  }
}
