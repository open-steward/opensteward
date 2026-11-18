import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface ProsvasisOrganization {
  id: string | number
  CompanyName: string
  TaxId: string
  Address: string
  Email: string
  Phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: ProsvasisOrganization): Organization {
  const address = toAddress({ address1: raw.Address })

  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.TaxId || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
