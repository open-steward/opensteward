import type { Organization } from '../../../schema/organization'

export interface SpirisCompanySettings {
  Name: string
  CorporateIdentityNumber: string
  Email: string
  Phone: string
  MobilePhone: string
  Address1: string
  Address2: string
  City: string
  PostalCode: string
  CountryCode: string
  CurrencyCode: string
  Website: string
  [key: string]: unknown
}

export function transformOrganization(raw: SpirisCompanySettings): Organization {
  return {
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.CorporateIdentityNumber || undefined,
    currency: raw.CurrencyCode || undefined,
    website: raw.Website || undefined,
    address: {
      address1: raw.Address1 || undefined,
      address2: raw.Address2 || undefined,
      city: raw.City || undefined,
      postalCode: raw.PostalCode || undefined,
      country: raw.CountryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
