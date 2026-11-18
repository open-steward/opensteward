import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MaxioOrganization {
  id: number
  name: string
  subdomain: string
  currency: string
  address: string
  address_2: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
  email: string
  [key: string]: unknown
}

export function transformOrganization(raw: MaxioOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    address: toAddress({
      address1: raw.address,
      address2: raw.address_2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
