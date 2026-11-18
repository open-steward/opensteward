import type { Organization } from '../../../schema/organization'

export interface BCCompany {
  id: string
  systemVersion: string
  timestamp: number
  name: string
  displayName: string
  businessProfileId: string
  systemCreatedAt: string
  systemCreatedBy: string
  systemModifiedAt: string
  systemModifiedBy: string
  taxRegistrationNumber?: string
  currencyCode?: string
  country?: string
  address?: {
    street?: string
    city?: string
    state?: string
    countryLetterCode?: string
    postalCode?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: BCCompany): Organization {
  return {
    id: raw.id,
    name: raw.displayName || raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.taxRegistrationNumber || undefined,
    currency: raw.currencyCode || undefined,
    address: raw.address
      ? {
          address1: raw.address.street || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.postalCode || undefined,
          country: raw.address.countryLetterCode || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
