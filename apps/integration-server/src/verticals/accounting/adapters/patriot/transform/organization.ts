import type { Organization } from '../../../schema/organization'

export interface PatriotOrganization {
  id: string
  name: string
  legal_name: string
  tax_id: string
  currency: string
  timezone: string
  website: string
  address: {
    line1: string
    city: string
    state: string
    zip: string
    country: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: PatriotOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address?.line1 || undefined,
      city: raw.address?.city || undefined,
      region: raw.address?.state || undefined,
      postalCode: raw.address?.zip || undefined,
      country: raw.address?.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
