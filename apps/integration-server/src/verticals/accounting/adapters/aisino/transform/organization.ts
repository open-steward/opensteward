import type { Organization } from '../../../schema/organization'

export interface AisinoOrganization {
  orgCode?: string
  orgName?: string
  taxCode?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AisinoOrganization): Organization {
  return {
    id: raw.orgCode ? String(raw.orgCode) : '',
    name: raw.orgName || undefined,
    taxNumber: raw.taxCode || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
