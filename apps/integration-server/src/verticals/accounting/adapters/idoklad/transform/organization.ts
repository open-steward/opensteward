import type { Organization } from '../../../schema/organization'

export interface IdokladOrganization {
  Id: string | number
  CompanyName?: string
  LegalName?: string
  TaxNumber?: string
  CurrencyId?: string
  Email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: IdokladOrganization): Organization {
  return {
    id: String(raw.Id),
    name: raw.CompanyName || undefined,
    legalName: raw.LegalName || undefined,
    taxNumber: raw.TaxNumber || undefined,
    currency: raw.CurrencyId || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
