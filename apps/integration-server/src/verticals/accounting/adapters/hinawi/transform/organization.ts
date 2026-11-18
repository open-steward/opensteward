import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface HinawiCompany {
  id: string | number
  Name: string
  Email: string
  Phone: string
  Address: string
  TaxId: string
  Currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: HinawiCompany): Organization {
  return {
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.TaxId || undefined,
    currency: raw.Currency || undefined,
    address: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
