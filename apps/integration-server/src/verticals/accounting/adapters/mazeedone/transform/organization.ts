import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MazeedOneCompany {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  vat_number: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: MazeedOneCompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    currency: raw.currency || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
