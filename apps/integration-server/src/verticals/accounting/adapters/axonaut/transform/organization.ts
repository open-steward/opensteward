import type { Organization } from '../../../schema/organization'

export interface AxonautOrganization {
  id: string
  name: string
  legal_name: string
  siret: string
  vat_number: string
  address: string
  zip_code: string
  city: string
  country: string
  email: string
  phone: string
  website: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: AxonautOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.siret || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
