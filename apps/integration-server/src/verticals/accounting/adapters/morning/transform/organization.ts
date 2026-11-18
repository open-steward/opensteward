import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MorningBusiness {
  id: string
  name: string
  taxId?: string
  email?: string
  phone?: string
  address?: {
    city?: string
    country?: string
    streetAddress?: string
    zip?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: MorningBusiness): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    taxNumber: raw.taxId || undefined,
    address: toAddress({
      address1: raw.address?.streetAddress,
      city: raw.address?.city,
      postalCode: raw.address?.zip,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
