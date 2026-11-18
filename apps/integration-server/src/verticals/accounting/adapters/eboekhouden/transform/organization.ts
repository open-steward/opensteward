import type { Organization } from '../../../schema/organization'

export interface EBoekhoudenOrg {
  companyName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  country?: string
  currency?: string
  vatNumber?: string
  cocNumber?: string
  address?: string
  zipCode?: string
  city?: string
  [key: string]: unknown
}

export function transformOrganization(raw: EBoekhoudenOrg): Organization {
  return {
    name: raw.companyName || undefined,
    taxNumber: raw.vatNumber || raw.cocNumber || undefined,
    currency: raw.currency || undefined,
    address:
      raw.city || raw.country
        ? {
            address1: raw.address || undefined,
            city: raw.city || undefined,
            postalCode: raw.zipCode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
