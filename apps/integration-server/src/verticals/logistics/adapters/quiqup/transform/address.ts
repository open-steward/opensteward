import type { Address } from '../../../schema/shared'

/**
 * Quiqup address shape — used in both orders and deliveries.
 */
export interface QuiqupAddress {
  name?: string | null
  company_name?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postcode?: string | null
  country_code?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: QuiqupAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.company_name ?? undefined,
    street1: raw.address_line_1 ?? undefined,
    street2: raw.address_line_2 ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.postcode ?? undefined,
    country: raw.country_code ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}
