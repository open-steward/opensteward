import type { Organization } from '../../../schema/organization'

// AccountsPortal company/business profile wire shape
export interface APOrganization {
  id: number
  name: string
  legal_name: string | null
  company_number: string | null
  vat_number: string | null
  currency: string | null
  timezone: string | null
  fiscal_year_end_month: number | null
  website: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  region: string | null
  postcode: string | null
  country: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: APOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.vat_number || raw.company_number || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month ?? undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address_line_1 || undefined,
      address2: raw.address_line_2 || undefined,
      city: raw.city || undefined,
      region: raw.region || undefined,
      postalCode: raw.postcode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
