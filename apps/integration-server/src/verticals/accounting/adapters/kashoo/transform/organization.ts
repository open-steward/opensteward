import type { Organization } from '../../../schema/organization'

export interface KashooOrganization {
  id: string
  name: string
  legal_name: string
  tax_number: string
  currency: string
  website: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: KashooOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
