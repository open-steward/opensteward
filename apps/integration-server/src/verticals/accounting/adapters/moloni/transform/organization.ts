import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MoloniOrganization {
  company_id: number
  name: string
  vat: string
  address: string
  email: string
  phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: MoloniOrganization): Organization {
  return {
    id: String(raw.company_id),
    name: raw.name || undefined,
    taxNumber: raw.vat || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
