import type { Organization } from '../../../schema/organization'

export interface BluenextCompany {
  name: string
  legalName: string
  vatNumber: string
  address: string
  city: string
  postalCode: string
  province: string
  country: string
  email: string
  phone: string
  website: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: BluenextCompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.vatNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postalCode || undefined,
      region: raw.province || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
