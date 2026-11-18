import type { Organization } from '../../../schema/organization'

export interface ContaOrganization {
  id: string
  name?: string
  org_number?: string
  vat_number?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postal_code?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: ContaOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_number || undefined,
    address: {
      address1: raw.address?.street || undefined,
      city: raw.address?.city || undefined,
      postalCode: raw.address?.postal_code || undefined,
      country: raw.address?.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
