import type { Organization } from '../../../schema/organization'

export interface PandleOrganization {
  id: number
  name: string
  legal_name: string
  company_number: string
  vat_number: string
  currency: string
  address_line_1: string
  address_line_2: string
  city: string
  region: string
  postcode: string
  country: string
  website: string
  [key: string]: unknown
}

export function transformOrganization(raw: PandleOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.vat_number || raw.company_number || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address_line_1 || undefined,
      address2: raw.address_line_2 || undefined,
      city: raw.city || undefined,
      region: raw.region || undefined,
      postalCode: raw.postcode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
