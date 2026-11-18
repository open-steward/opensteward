import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface ClearBooksOrganization {
  company_name: string
  vat_number: string
  company_number: string
  email: string
  phone: string
  address_1: string
  address_2: string
  town: string
  county: string
  postcode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: ClearBooksOrganization): Organization {
  return {
    name: raw.company_name || undefined,
    legalName: raw.company_name || undefined,
    taxNumber: raw.vat_number || undefined,
    address: toAddress({
      address1: raw.address_1,
      address2: raw.address_2,
      city: raw.town,
      region: raw.county,
      postalCode: raw.postcode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
