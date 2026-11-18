import type { Organization } from '../../../schema/organization'

export interface FlowAccountOrganization {
  id: string | number
  businessName: string
  taxId: string
  address: string
  email: string
  phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: FlowAccountOrganization): Organization {
  return {
    name: raw.businessName || undefined,
    taxNumber: raw.taxId || undefined,
    address: raw.address
      ? {
          address1: raw.address,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
