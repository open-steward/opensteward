import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface ICountOrganization {
  company_name: string
  tax_id?: string
  address?: string
  city?: string
  country?: string
  email?: string
  phone?: string
  id?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ICountOrganization): Organization {
  return {
    id: raw.id as string | undefined,
    name: raw.company_name || undefined,
    taxNumber: raw.tax_id || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
