import type { Organization } from '../../../schema/organization'

export interface ClearOrganization {
  id: string
  name: string
  trade_name: string
  gstin: string
  pan: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
  country: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: ClearOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.trade_name || raw.name || undefined,
    taxNumber: raw.gstin || undefined,
    organizationCode: raw.pan || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address_line1 || undefined,
      address2: raw.address_line2 || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.pincode || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
