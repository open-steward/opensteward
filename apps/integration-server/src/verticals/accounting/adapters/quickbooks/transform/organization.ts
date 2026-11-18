import type { Organization } from '../../../schema/organization'

export interface QBOCompanyInfo {
  Id: string
  CompanyName: string
  LegalName: string
  CompanyAddr?: {
    Line1: string
    City: string
    PostalCode: string
    CountrySubDivisionCode: string
    Country: string
  }
  PrimaryPhone?: { FreeFormNumber: string }
  WebAddr?: { URI: string }
  Country: string
  FiscalYearStartMonth: string
  [key: string]: unknown
}

export function transformOrganization(raw: QBOCompanyInfo): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.LegalName || undefined,
    website: raw.WebAddr?.URI || undefined,
    address: raw.CompanyAddr
      ? {
          address1: raw.CompanyAddr.Line1 || undefined,
          city: raw.CompanyAddr.City || undefined,
          postalCode: raw.CompanyAddr.PostalCode || undefined,
          country: raw.CompanyAddr.Country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
