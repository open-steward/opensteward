import type { Organization } from '../../../schema/organization'

export interface FattureCloudCompany {
  name?: string
  vat_number?: string
  fiscal_code?: string
  currency?: { id?: string }
  address_street?: string
  address_postal_code?: string
  address_city?: string
  address_province?: string
  address_country?: string
  [key: string]: unknown
}

export function transformOrganization(raw: FattureCloudCompany): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.vat_number || raw.fiscal_code || undefined,
    currency: raw.currency?.id || undefined,
    address:
      raw.address_city || raw.address_country
        ? {
            address1: raw.address_street || undefined,
            city: raw.address_city || undefined,
            region: raw.address_province || undefined,
            postalCode: raw.address_postal_code || undefined,
            country: raw.address_country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
