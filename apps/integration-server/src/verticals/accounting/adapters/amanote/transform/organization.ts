import type { Organization } from '../../../schema/organization'

export interface AmanoteOrganization {
  id?: string | number
  name?: string
  legal_name?: string
  tax_number?: string
  vat_number?: string
  currency?: string
  street?: string
  city?: string
  postal_code?: string
  country?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AmanoteOrganization): Organization {
  return {
    name: raw.name,
    legalName: raw.legal_name,
    taxNumber: raw.tax_number ?? raw.vat_number,
    currency: raw.currency,
    address: {
      address1: raw.street,
      city: raw.city,
      postalCode: raw.postal_code,
      country: raw.country,
    },
    metadata: raw as Record<string, unknown>,
  }
}
