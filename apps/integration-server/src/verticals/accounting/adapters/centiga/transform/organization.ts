import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface CentigaOrganization {
  id: string
  name?: string
  org_nr?: string
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

export function transformOrganization(raw: CentigaOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.org_nr || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postal_code,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
