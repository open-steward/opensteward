import type { Organization } from '../../../schema/organization'

export interface FakturoidOrganization {
  id: number
  name: string
  registration_no: string
  vat_no: string
  street: string
  city: string
  zip: string
  country: string
  currency: string
  phone: string
  web: string
  [key: string]: unknown
}

export function transformOrganization(raw: FakturoidOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    organizationCode: raw.registration_no || undefined,
    taxNumber: raw.vat_no || undefined,
    currency: raw.currency || undefined,
    website: raw.web || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
