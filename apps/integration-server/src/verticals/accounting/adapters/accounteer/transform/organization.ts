import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AccounteerBusiness {
  id: string
  name?: string
  tax_number?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AccounteerBusiness): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
