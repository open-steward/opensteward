import type { Organization } from '../../../schema/organization'

export interface FortnoxCompanyInfo {
  CompanyName: string
  OrganizationNumber: string
  Address: string
  Address2: string
  City: string
  ZipCode: string
  CountryCode: string
  Email: string
  Phone: string
  Website: string
  Currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: FortnoxCompanyInfo): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.OrganizationNumber || undefined,
    currency: raw.Currency || undefined,
    website: raw.Website || undefined,
    address: {
      address1: raw.Address || undefined,
      address2: raw.Address2 || undefined,
      city: raw.City || undefined,
      postalCode: raw.ZipCode || undefined,
      country: raw.CountryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
