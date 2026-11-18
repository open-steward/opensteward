import type { Organization } from '../../../schema/organization'

export interface LexofficeOrganization {
  organizationId: string
  companyName: string
  created: { userEmail: string }
  connectionId: string
  taxType: string
  smallBusiness: boolean
  [key: string]: unknown
}

export function transformOrganization(raw: LexofficeOrganization): Organization {
  return {
    name: raw.companyName || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
