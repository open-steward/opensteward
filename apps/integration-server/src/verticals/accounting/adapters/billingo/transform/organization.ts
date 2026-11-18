import type { Organization } from '../../../schema/organization'

export interface BillingoOrganization {
  id: string | number
  name: string
  taxcode?: string
  [key: string]: unknown
}

export function transformOrganization(raw: BillingoOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.taxcode || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
