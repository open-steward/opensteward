import type { Organization } from '../../../schema/organization'

export interface ReckonBook {
  id: string
  name: string
  legalName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  postCode: string
  country: string
  currencyCode: string
  abn: string
  [key: string]: unknown
}

export function transformOrganization(raw: ReckonBook): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.abn || undefined,
    currency: raw.currencyCode || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.postCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
