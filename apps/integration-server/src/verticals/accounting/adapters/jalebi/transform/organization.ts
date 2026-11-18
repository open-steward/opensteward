import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface JalebiRestaurant {
  id: string | number
  name: string
  email: string
  phone: string
  address: string
  tax_registration: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: JalebiRestaurant): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_registration || undefined,
    currency: raw.currency || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
