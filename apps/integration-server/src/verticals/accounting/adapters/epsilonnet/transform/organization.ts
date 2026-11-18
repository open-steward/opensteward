import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface EpsilonNetOrganization {
  id: string | number
  companyName: string
  vatNumber: string
  address: string
  email: string
  phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: EpsilonNetOrganization): Organization {
  const address = toAddress({ address1: raw.address })

  return {
    name: raw.companyName || undefined,
    legalName: raw.companyName || undefined,
    taxNumber: raw.vatNumber || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
