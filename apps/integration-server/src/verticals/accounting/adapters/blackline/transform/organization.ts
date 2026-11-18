import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface BlacklineOrganization {
  companyId: string
  companyName: string
  legalName: string
  taxId: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
  country: string
  [key: string]: unknown
}

export function transformOrganization(raw: BlacklineOrganization): Organization {
  return {
    name: raw.companyName || undefined,
    legalName: raw.legalName || raw.companyName || undefined,
    taxNumber: raw.taxId || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
