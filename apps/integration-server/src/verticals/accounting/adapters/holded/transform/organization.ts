import type { Organization } from '../../../schema/organization'

export interface HoldedOrganization {
  id: string
  name: string
  legalName: string
  vatnumber: string
  currency: string
  website: string
  address: string
  city: string
  province: string
  postalCode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: HoldedOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.vatnumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.province || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
