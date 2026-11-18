import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface SmaccCompany {
  id: string
  name?: string
  tax_number?: string
  vat_number?: string
  email?: string
  phone?: string
  street?: string
  city?: string
  zip?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SmaccCompany): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.vat_number || raw.tax_number || undefined,
    currency: raw.currency || undefined,
    address: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
