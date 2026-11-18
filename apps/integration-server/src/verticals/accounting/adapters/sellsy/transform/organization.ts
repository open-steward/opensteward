import type { Organization } from '../../../schema/organization'

export interface SellsyOrganization {
  id: string
  name: string
  legal_name: string
  siret: string
  vat_number: string
  currency: string
  timezone: string
  website: string
  address_line_1: string
  address_line_2: string
  city: string
  postal_code: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: SellsyOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.vat_number || raw.siret || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address_line_1 || undefined,
      address2: raw.address_line_2 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postal_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
