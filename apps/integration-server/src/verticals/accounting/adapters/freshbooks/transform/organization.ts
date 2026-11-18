import type { Organization } from '../../../schema/organization'

export interface FreshBooksBusiness {
  id: number
  name: string
  account_id: string
  business_uuid: string
  address?: {
    street: string
    city: string
    province: string
    country: string
    postal_code: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: FreshBooksBusiness): Organization {
  return {
    name: raw.name || undefined,
    address: raw.address
      ? {
          address1: raw.address.street || undefined,
          city: raw.address.city || undefined,
          postalCode: raw.address.postal_code || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
