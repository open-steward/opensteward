import type { Organization } from '../../../schema/organization'

// Response shape from System_GetAccountDetails
export interface QuickFileAccountDetails {
  CompanyName?: string
  CompanyNumber?: string
  Address?: string
  CountryIso?: string
  BaseCurrency?: string
  VatRegNumber?: string
  Web?: string
  Tel?: string
  BusinessType?: string
  YearEndDate?: string
  [key: string]: unknown
}

export function transformOrganization(raw: QuickFileAccountDetails): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    organizationCode: raw.CompanyNumber || undefined,
    taxNumber: raw.VatRegNumber || undefined,
    currency: raw.BaseCurrency || undefined,
    website: raw.Web || undefined,
    address: raw.Address
      ? { address1: raw.Address, country: raw.CountryIso || undefined }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
