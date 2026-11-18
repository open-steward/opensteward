import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface LucaOrganization {
  id: string
  name?: string
  org_number?: string
  vat_number?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postal_code?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: LucaOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_number || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postal_code,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
