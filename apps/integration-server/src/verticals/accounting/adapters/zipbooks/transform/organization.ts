import type { Organization } from '../../../schema/organization'

export interface ZipBooksOrganization {
  id: string
  name: string
  legal_name: string
  tax_id: string
  currency: string
  website: string
  street: string
  city: string
  state: string
  zip: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: ZipBooksOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
