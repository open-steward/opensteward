import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface XledgerOrganization {
  dbId: string
  description?: string
  orgNo?: string
  currencyCode?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    countryCode?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: XledgerOrganization): Organization {
  return {
    id: String(raw.dbId),
    name: raw.description || undefined,
    legalName: raw.description || undefined,
    taxNumber: raw.orgNo || undefined,
    currency: raw.currencyCode || undefined,
    address: toAddress({
      address1: raw.address?.street,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
