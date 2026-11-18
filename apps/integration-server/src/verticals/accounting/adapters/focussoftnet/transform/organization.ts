import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface FocusSoftnetOrganization {
  CompCode: string
  CompName: string
  Email: string
  Phone: string
  Address: string
  TaxRegNo: string
  CurrCode: string
  [key: string]: unknown
}

export function transformOrganization(raw: FocusSoftnetOrganization): Organization {
  return {
    id: String(raw.CompCode),
    name: raw.CompName || undefined,
    legalName: raw.CompName || undefined,
    taxNumber: raw.TaxRegNo || undefined,
    currency: raw.CurrCode || undefined,
    address: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
