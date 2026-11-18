import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface UhasibuBusiness {
  id: string
  name?: string
  tax_number?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  region?: string
  postal_code?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: UhasibuBusiness): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.region,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
