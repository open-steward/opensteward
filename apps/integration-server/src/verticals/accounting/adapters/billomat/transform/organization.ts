import type { Organization } from '../../../schema/organization'

export interface BillomatOrganization {
  id: string
  company_name: string
  legal_name: string
  tax_number: string
  currency_code: string
  street: string
  city: string
  zip: string
  country_code: string
  phone: string
  url: string
  [key: string]: unknown
}

export function transformOrganization(raw: BillomatOrganization): Organization {
  return {
    id: raw.id,
    name: raw.company_name || undefined,
    legalName: raw.legal_name || raw.company_name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency_code || undefined,
    website: raw.url || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country_code || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
