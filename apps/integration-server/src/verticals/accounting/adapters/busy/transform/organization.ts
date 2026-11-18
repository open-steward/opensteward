import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface BusyOrganization {
  CompanyCode: string
  CompanyName: string
  Email: string
  Mobile: string
  Address: string
  GSTNo: string
  Currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: BusyOrganization): Organization {
  return {
    id: String(raw.CompanyCode),
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.GSTNo || undefined,
    currency: raw.Currency || undefined,
    address: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
