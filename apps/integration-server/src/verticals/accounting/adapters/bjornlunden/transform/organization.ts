import type { Organization } from '../../../schema/organization'

export interface BlOrganization {
  Id: string
  Name: string
  LegalName: string
  OrgNumber: string
  Currency: string
  Website: string
  Address1: string
  City: string
  ZipCode: string
  Country: string
  [key: string]: unknown
}

export function transformOrganization(raw: BlOrganization): Organization {
  return {
    id: raw.Id || undefined,
    name: raw.Name || undefined,
    legalName: raw.LegalName || undefined,
    taxNumber: raw.OrgNumber || undefined,
    currency: raw.Currency || undefined,
    website: raw.Website || undefined,
    address: {
      address1: raw.Address1 || undefined,
      city: raw.City || undefined,
      postalCode: raw.ZipCode || undefined,
      country: raw.Country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
