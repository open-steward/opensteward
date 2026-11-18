import type { Organization } from '../../../schema/organization'

export interface KingdeeOrganization {
  orgId?: string
  orgName?: string
  taxId?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KingdeeOrganization): Organization {
  return {
    id: raw.orgId ? String(raw.orgId) : '',
    name: raw.orgName || undefined,
    taxNumber: raw.taxId || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
