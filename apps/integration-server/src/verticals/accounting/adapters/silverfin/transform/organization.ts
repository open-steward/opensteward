import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface SilverfinOrganization {
  id: string | number
  name: string
  company_number: string
  vat_number: string
  email: string
  phone: string
  address: string
  city: string
  postal_code: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: SilverfinOrganization): Organization {
  const address = toAddress({
    address1: raw.address,
    city: raw.city,
    postalCode: raw.postal_code,
    country: raw.country,
  })

  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
