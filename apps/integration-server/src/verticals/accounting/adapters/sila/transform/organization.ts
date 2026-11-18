import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface SilaEntity {
  entity_name?: string
  first_name?: string
  last_name?: string
  address?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  ein?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SilaEntity): Organization {
  return {
    name: raw.entity_name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    taxNumber: raw.ein || undefined,
    currency: 'USD',
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country || 'US',
    }),
    metadata: raw as Record<string, unknown>,
  }
}
