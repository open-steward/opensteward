import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface WafeqOrganization {
  id?: string
  name?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postal_code?: string
    country?: string
    [key: string]: unknown
  }
  tax_number?: string
  currency?: string
  fiscal_year_start?: string
  [key: string]: unknown
}

export function transformOrganization(raw: WafeqOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postal_code,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
