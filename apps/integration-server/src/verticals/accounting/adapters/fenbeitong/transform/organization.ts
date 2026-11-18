import type { Organization } from '../../../schema/organization'

export interface FenbeitongOrganization {
  companyId?: string
  companyName?: string
  taxNo?: string
  [key: string]: unknown
}

export function transformOrganization(raw: FenbeitongOrganization): Organization {
  return {
    id: raw.companyId ? String(raw.companyId) : '',
    name: raw.companyName || undefined,
    taxNumber: raw.taxNo || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
