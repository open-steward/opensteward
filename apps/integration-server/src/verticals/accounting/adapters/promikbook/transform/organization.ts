import type { Organization } from '../../../schema/organization'

export interface PromikBookOrganization {
  id?: number | string
  name?: string
  org_number?: string
  vat_number?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: PromikBookOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_number || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
