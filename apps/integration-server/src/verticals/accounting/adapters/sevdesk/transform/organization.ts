import type { Organization } from '../../../schema/organization'

export interface SevDeskOrganization {
  id: string
  name: string
  website: string
  email: string
  phone: string
  vatNumber: string
  street: string
  zip: string
  city: string
  countryCode: string
  [key: string]: unknown
}

export function transformOrganization(raw: SevDeskOrganization): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.vatNumber || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.countryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
