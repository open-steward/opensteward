import type { Organization } from '../../../schema/organization'

export interface TripletexCompany {
  id: number
  name: string
  organizationNumber: string
  address?: {
    addressLine1: string
    addressLine2: string
    city: string
    postalCode: string
    country?: { id: string }
  }
  [key: string]: unknown
}

export function transformOrganization(raw: TripletexCompany): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.organizationNumber || undefined,
    address: raw.address
      ? {
          address1: raw.address.addressLine1 || undefined,
          address2: raw.address.addressLine2 || undefined,
          city: raw.address.city || undefined,
          postalCode: raw.address.postalCode || undefined,
          country: raw.address.country?.id || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
