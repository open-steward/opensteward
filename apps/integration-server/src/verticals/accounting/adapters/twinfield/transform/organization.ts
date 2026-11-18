import type { Organization } from '../../../schema/organization'

export interface TwinfieldOrganization {
  code: string
  name: string
  shortName: string
  vatNumber: string
  cocNumber: string
  currency: string
  addressLine1: string
  city: string
  postcode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: TwinfieldOrganization): Organization {
  return {
    id: raw.code,
    name: raw.name || undefined,
    legalName: raw.shortName || raw.name || undefined,
    taxNumber: raw.vatNumber || undefined,
    organizationCode: raw.cocNumber || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.addressLine1 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postcode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
