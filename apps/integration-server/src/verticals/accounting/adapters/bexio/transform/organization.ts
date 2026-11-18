import type { Organization } from '../../../schema/organization'

export interface BexioOrganization {
  id: number
  name: string
  legal_name: string
  tax_number: string
  currency: string
  timezone: string
  website: string
  fiscal_year_end_month: number
  address: string
  city: string
  postcode: string
  country_code: string
  [key: string]: unknown
}

export function transformOrganization(raw: BexioOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postcode || undefined,
      country: raw.country_code || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
