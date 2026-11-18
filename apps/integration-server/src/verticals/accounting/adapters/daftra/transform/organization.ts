import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface DaftraCompany {
  id?: string | number
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  postal_code?: string
  country_code?: string
  tax_number?: string
  currency_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: DaftraCompany): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency_code || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_code,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
