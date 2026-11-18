import type { Organization } from '../../../schema/organization'

export interface WaveOrganization {
  id: string
  name: string
  currency: { code: string } | null
  address: {
    addressLine1: string
    city: string
    province: { code: string } | null
    postalCode: string
    country: { code: string } | null
  } | null
  [key: string]: unknown
}

export function transformOrganization(raw: WaveOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    currency: raw.currency?.code || undefined,
    address: raw.address
      ? {
          address1: raw.address.addressLine1 || undefined,
          city: raw.address.city || undefined,
          region: raw.address.province?.code || undefined,
          postalCode: raw.address.postalCode || undefined,
          country: raw.address.country?.code || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
