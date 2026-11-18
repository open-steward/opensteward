import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface ZervantOrganization {
  id: string
  name?: string
  businessId?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    zipCode?: string
    countryCode?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: ZervantOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.businessId || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.zipCode,
      country: raw.address?.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
