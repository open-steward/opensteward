import type { Organization } from '../../../schema/organization'

export interface AkauntingOrganization {
  id: number
  name: string
  email: string
  tax_number: string
  currency: string
  address: string
  city: string
  zip_code: string
  state: string
  country: string
  phone: string
  domain: string
  [key: string]: unknown
}

export function transformOrganization(raw: AkauntingOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    website: raw.domain || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip_code || undefined,
      region: raw.state || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
