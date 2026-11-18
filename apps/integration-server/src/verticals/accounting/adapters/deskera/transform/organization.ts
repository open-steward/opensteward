import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface DeskeraOrganizationAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export interface DeskeraOrganization {
  id: string
  name: string
  legalName?: string
  email?: string
  phone?: string
  website?: string
  currency?: string
  address?: DeskeraOrganizationAddress
  taxNumber?: string
  [key: string]: unknown
}

export function transformOrganization(raw: DeskeraOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? toAddress({
          address1: raw.address.address1,
          address2: raw.address.address2,
          city: raw.address.city,
          region: raw.address.state,
          postalCode: raw.address.postalCode,
          country: raw.address.country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
