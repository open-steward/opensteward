import type { Organization } from '../../../schema/organization'

export interface WintOrganization {
  id?: number | string
  name?: string
  org_nr?: string
  vat_nr?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  zip?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: WintOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_nr || undefined,
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
