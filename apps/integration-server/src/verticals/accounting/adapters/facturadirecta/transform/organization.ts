import type { Organization } from '../../../schema/organization'

export interface FacturadirectaOrganization {
  name: string
  legal_name: string
  tax_id: string
  currency: string
  website: string
  address: string
  city: string
  postal_code: string
  country: string
  region: string
  [key: string]: unknown
}

export function transformOrganization(raw: FacturadirectaOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postal_code || undefined,
      country: raw.country || undefined,
      region: raw.region || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
