import type { Organization } from '../../../schema/organization'

export interface ChanjetOrganization {
  companyId?: string
  companyName?: string
  taxNo?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ChanjetOrganization): Organization {
  return {
    id: raw.companyId ? String(raw.companyId) : '',
    name: raw.companyName || undefined,
    taxNumber: raw.taxNo || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
