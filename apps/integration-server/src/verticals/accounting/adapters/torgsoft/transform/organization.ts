import type { Organization } from '../../../schema/organization'

export interface TorgsoftOrganization {
  id: string
  name: string
  tax_id?: string
  [key: string]: unknown
}

export function transformOrganization(raw: TorgsoftOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_id || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
