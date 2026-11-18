import type { Organization } from '../../../schema/organization'

export interface ProcountorOrganization {
  id: number
  name: string
  businessId: string
  street: string
  city: string
  zip: string
  country: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: ProcountorOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.businessId || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
