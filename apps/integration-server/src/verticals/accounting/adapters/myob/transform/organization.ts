import type { Organization } from '../../../schema/organization'

export interface MyobCompanyFile {
  Name?: string
  Id?: string
  LibraryPath?: string
  ProductVersion?: string
  CheckedOutDate?: string
  BaseCurrency?: string
  Country?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MyobCompanyFile): Organization {
  return {
    id: raw.Id || undefined,
    name: raw.Name || undefined,
    currency: raw.BaseCurrency || undefined,
    address: raw.Country ? { country: raw.Country } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
