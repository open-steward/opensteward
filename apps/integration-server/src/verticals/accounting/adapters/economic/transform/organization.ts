import type { Organization } from '../../../schema/organization'

export interface EconomicSelf {
  agreementNumber: number
  companyName: string
  vatNumber: string
  baseCurrency: string
  company: {
    addressLine1: string
    addressLine2: string
    city: string
    zip: string
    country: string
    website: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: EconomicSelf): Organization {
  return {
    id: String(raw.agreementNumber),
    name: raw.companyName || undefined,
    legalName: raw.companyName || undefined,
    taxNumber: raw.vatNumber || undefined,
    currency: raw.baseCurrency || undefined,
    website: raw.company?.website || undefined,
    address: {
      address1: raw.company?.addressLine1 || undefined,
      address2: raw.company?.addressLine2 || undefined,
      city: raw.company?.city || undefined,
      postalCode: raw.company?.zip || undefined,
      country: raw.company?.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
