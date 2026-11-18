import type { Organization } from '../../../schema/organization'

export interface BukkuCompany {
  id: string | number
  name: string
  legal_name: string
  email: string
  phone: string
  tax_number: string
  address_line_1: string
  address_line_2: string
  city: string
  postcode: string
  state: string
  country: string
  currency_code: string
  [key: string]: unknown
}

export function transformOrganization(raw: BukkuCompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency_code || undefined,
    address: {
      address1: raw.address_line_1 || undefined,
      address2: raw.address_line_2 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postcode || undefined,
      region: raw.state || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
