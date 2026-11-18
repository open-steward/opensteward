import type { Organization } from '../../../schema/organization'

export interface SendRegningOrganization {
  id: string
  name?: string
  orgNo?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    countryCode?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: SendRegningOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.orgNo || undefined,
    address: {
      address1: raw.address?.street || undefined,
      city: raw.address?.city || undefined,
      postalCode: raw.address?.postalCode || undefined,
      country: raw.address?.countryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
