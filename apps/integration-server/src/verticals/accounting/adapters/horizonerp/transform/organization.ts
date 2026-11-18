import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface HorizonErpOrganization {
  id: string
  name: string
  email: string
  phone: string
  address: string
  gstin: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: HorizonErpOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.gstin || undefined,
    currency: raw.currency || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
