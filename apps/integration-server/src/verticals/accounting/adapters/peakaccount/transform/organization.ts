import type { Organization } from '../../../schema/organization'

export interface PeakAccountOrganization {
  id: string | number
  companyName: string
  taxId: string
  address: string
  email: string
  phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: PeakAccountOrganization): Organization {
  return {
    name: raw.companyName || undefined,
    taxNumber: raw.taxId || undefined,
    address: raw.address
      ? {
          address1: raw.address,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
