import type { Organization } from '../../../schema/organization'

export interface QuipuOrganization {
  name: string
  legal_name: string
  tax_id: string
  currency: string
  website: string
  address: string
  city: string
  zip_code: string
  country_code: string
  region: string
  [key: string]: unknown
}

export function transformOrganization(raw: QuipuOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip_code || undefined,
      country: raw.country_code || undefined,
      region: raw.region || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
