import type { Organization } from '../../../schema/organization'

export interface DineroOrganization {
  Id: number
  Name: string
  VatNumber: string
  Address: string
  City: string
  ZipCode: string
  CountryKey: string
  Currency: string
  Website: string
  [key: string]: unknown
}

export function transformOrganization(raw: DineroOrganization): Organization {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.VatNumber || undefined,
    currency: raw.Currency || undefined,
    website: raw.Website || undefined,
    address: {
      address1: raw.Address || undefined,
      city: raw.City || undefined,
      postalCode: raw.ZipCode || undefined,
      country: raw.CountryKey || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
