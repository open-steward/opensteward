import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AccurateCompany {
  id: number
  name: string
  taxId: string | null
  address: string | null
  email: string | null
  phone: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: AccurateCompany): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.taxId || undefined,
    address: toAddress({ address1: raw.address ?? undefined }),
    metadata: raw as Record<string, unknown>,
  }
}
