import type { Organization } from '../../../schema/organization'

export interface AutocountCompanyInfo {
  CompanyCode: string
  CompanyName: string
  CompanyAddress: string
  CompanyAddress2: string
  CompanyAddress3: string
  CompanyPhone: string
  CompanyFax: string
  CompanyEmail: string
  CompanyCurrencyCode: string
  CompanyGSTRegistrationNo: string
  CompanyRocNo: string
  [key: string]: unknown
}

export function transformOrganization(raw: AutocountCompanyInfo): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.CompanyGSTRegistrationNo || undefined,
    organizationCode: raw.CompanyRocNo || undefined,
    currency: raw.CompanyCurrencyCode || undefined,
    address: {
      address1: raw.CompanyAddress || undefined,
      address2: [raw.CompanyAddress2, raw.CompanyAddress3].filter(Boolean).join(', ') || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
