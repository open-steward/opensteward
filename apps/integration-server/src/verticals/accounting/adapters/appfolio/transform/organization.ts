import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AppFolioOrganization {
  id: string | number
  company_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  tax_id: string
  [key: string]: unknown
}

export function transformOrganization(raw: AppFolioOrganization): Organization {
  return {
    name: raw.company_name || undefined,
    legalName: raw.company_name || undefined,
    taxNumber: raw.tax_id || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
