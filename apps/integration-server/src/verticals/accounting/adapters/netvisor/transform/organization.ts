import type { Organization } from '../../../schema/organization'

export interface NetvisorOrganization {
  CompanyId: string
  Name: string
  BusinessId: string
  Address: string
  City: string
  PostCode: string
  Country: string
  Currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: NetvisorOrganization): Organization {
  return {
    id: raw.CompanyId,
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.BusinessId || undefined,
    currency: raw.Currency || undefined,
    address: {
      address1: raw.Address || undefined,
      city: raw.City || undefined,
      postalCode: raw.PostCode || undefined,
      country: raw.Country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
