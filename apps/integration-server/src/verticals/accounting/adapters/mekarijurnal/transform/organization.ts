import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface MekariJurnalCompany {
  id: number
  company_name: string
  address: string | null
  email: string | null
  phone: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: MekariJurnalCompany): Organization {
  return {
    id: String(raw.id),
    name: raw.company_name || undefined,
    address: toAddress({ address1: raw.address ?? undefined }),
    metadata: raw as Record<string, unknown>,
  }
}
