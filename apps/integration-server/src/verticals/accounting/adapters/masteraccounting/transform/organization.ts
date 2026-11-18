import type { Organization } from '../../../schema/organization'

export interface MasteraccountingOrganization {
  id: string
  name: string
  taxCode?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MasteraccountingOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.taxCode || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
