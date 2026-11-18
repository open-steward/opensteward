import type { Organization } from '../../../schema/organization'

export interface CloudFinanceCompany {
  name: string
  legal_name: string
  vat_number: string
  address: string
  city: string
  postal_code: string
  province: string
  country: string
  email: string
  phone: string
  website: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: CloudFinanceCompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.vat_number || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postal_code || undefined,
      region: raw.province || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
