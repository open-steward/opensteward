import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface FACompany {
  id?: number | string
  name?: string
  phone?: string
  fax?: string
  email?: string
  address?: string
  postal_code?: string
  city?: string
  state?: string
  country?: string
  country_code?: string
  gst_no?: string
  curr_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: FACompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.gst_no || undefined,
    currency: raw.curr_code || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country_code || raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
