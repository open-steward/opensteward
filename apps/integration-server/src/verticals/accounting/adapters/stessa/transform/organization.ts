import type { Organization } from '../../../schema/organization'

export interface StessaOrganization {
  id: string
  name: string
  legalName: string
  taxNumber: string
  currency: string
  website: string
  address: string
  city: string
  state: string
  postalCode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: StessaOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
