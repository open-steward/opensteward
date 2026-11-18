import type { Organization } from '../../../schema/organization'

export interface SpeedLedgerOrganization {
  id?: number | string
  name?: string
  orgNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  postalCode?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SpeedLedgerOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.orgNumber || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
