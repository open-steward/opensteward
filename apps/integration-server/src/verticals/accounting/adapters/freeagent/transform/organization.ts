import type { Organization } from '../../../schema/organization'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface FreeAgentCompany {
  url: string
  name: string
  subdomain: string
  type: string
  currency: string
  registration_number: string
  sales_tax_registration_number: string
  address1: string
  address2: string
  address3: string
  town: string
  region: string
  postcode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: FreeAgentCompany): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.registration_number || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address1 || undefined,
      address2: raw.address2 || undefined,
      city: raw.town || undefined,
      postalCode: raw.postcode || undefined,
      country: toIso3166Alpha2(raw.country),
    },
    metadata: raw as Record<string, unknown>,
  }
}
