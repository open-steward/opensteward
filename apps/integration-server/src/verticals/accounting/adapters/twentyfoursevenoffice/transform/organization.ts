import type { Organization } from '../../../schema/organization'

export interface TwentyFourSevenOrganization {
  id: string
  name: string
  legalName: string
  organizationNumber: string
  currency: string
  street: string
  city: string
  postalCode: string
  country: string
  website: string
  [key: string]: unknown
}

export function transformOrganization(raw: TwentyFourSevenOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    organizationCode: raw.organizationNumber || undefined,
    taxNumber: raw.organizationNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
