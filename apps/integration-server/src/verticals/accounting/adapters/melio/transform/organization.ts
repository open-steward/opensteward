import type { Organization } from '../../../schema/organization'

// Melio /v1/organizations response shape
export interface MelioOrganization {
  id: string
  companyName?: string
  legalName?: string
  taxId?: string
  website?: string
  currency?: string
  timezone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MelioOrganization): Organization {
  return {
    id: raw.id || undefined,
    name: raw.companyName || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxId || undefined,
    currency: (raw.currency as Organization['currency']) || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? {
          address1: raw.address.line1 || undefined,
          address2: raw.address.line2 || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.postalCode || undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          country: raw.address.country as any,
        }
      : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
