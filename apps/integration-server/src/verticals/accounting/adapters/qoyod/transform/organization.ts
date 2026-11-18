import type { Organization } from '../../../schema/organization'

// Qoyod returns company/business info from a settings or organization endpoint
export interface QoyodOrganization {
  id?: number | null
  name?: string | null
  legal_name?: string | null
  vat_number?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  zip_code?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  currency?: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: QoyodOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
