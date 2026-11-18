import type { Organization } from '../../../schema/organization'

export interface CegidOrganization {
  id: string
  name: string
  legalName: string
  registrationNumber: string
  vatNumber: string
  addressLine1: string
  postalCode: string
  city: string
  country: string
  email: string
  phone: string
  website: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: CegidOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.registrationNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.addressLine1 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
