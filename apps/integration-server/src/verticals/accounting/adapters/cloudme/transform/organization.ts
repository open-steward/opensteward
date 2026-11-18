import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface CloudMeOrganization {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_id: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: CloudMeOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
