import type { Organization } from '../../../schema/organization'

export interface AcconomyOrganization {
  id?: number | string
  name?: string
  org_nr?: string
  vat_nr?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  postal_code?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AcconomyOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_nr || raw.vat_nr || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postal_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
