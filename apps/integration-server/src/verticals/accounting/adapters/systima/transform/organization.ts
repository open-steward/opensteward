import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface SystimaOrganization {
  id: string
  name?: string
  orgNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: SystimaOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.orgNumber || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
