import type { Organization } from '../../../schema/organization'

export interface MisaAmisCompany {
  id: string
  company_name: string
  company_code: string
  tax_code: string
  email: string
  phone: string
  address: string
  city: string
  province: string
  country: string
  currency_code: string
  fiscal_year_start: string
  [key: string]: unknown
}

export function transformOrganization(raw: MisaAmisCompany): Organization {
  return {
    id: raw.id || undefined,
    name: raw.company_name || undefined,
    legalName: raw.company_name || undefined,
    organizationCode: raw.company_code || undefined,
    taxNumber: raw.tax_code || undefined,
    currency: raw.currency_code || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.province || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
