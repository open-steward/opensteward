import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AccountsIQOrganization {
  entityId: string | number
  companyName: string
  taxNumber: string
  registrationNumber: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  postCode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: AccountsIQOrganization): Organization {
  const address = toAddress({
    address1: raw.addressLine1,
    address2: raw.addressLine2,
    city: raw.city,
    postalCode: raw.postCode,
    country: raw.country,
  })

  return {
    name: raw.companyName || undefined,
    legalName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
