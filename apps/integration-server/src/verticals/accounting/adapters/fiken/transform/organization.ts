import type { Organization } from '../../../schema/organization'

export interface FikenOrganization {
  slug: string
  name: string
  organizationNumber: string
  vatType: string
  address: {
    streetAddress: string
    city: string
    postCode: string
    country: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformOrganization(raw: FikenOrganization): Organization {
  return {
    id: raw.slug,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    organizationCode: raw.slug || undefined,
    taxNumber: raw.organizationNumber || undefined,
    currency: 'NOK',
    address: {
      address1: raw.address?.streetAddress || undefined,
      city: raw.address?.city || undefined,
      postalCode: raw.address?.postCode || undefined,
      country: raw.address?.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
