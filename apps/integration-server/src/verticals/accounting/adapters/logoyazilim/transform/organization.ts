import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface LogoOrganization {
  id: string
  CompanyName?: string
  TaxId?: string
  Address?: string
  Phone?: string
  Email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: LogoOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.TaxId || undefined,
    address: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
