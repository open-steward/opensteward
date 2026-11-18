import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MazumaBusiness {
  id?: string
  name?: string
  tax_number?: string
  address_line_1?: string
  address_line_2?: string
  city?: string
  county?: string
  postcode?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MazumaBusiness): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || 'GBP',
    address: toAddress({
      address1: raw.address_line_1,
      address2: raw.address_line_2,
      city: raw.city,
      region: raw.county,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
