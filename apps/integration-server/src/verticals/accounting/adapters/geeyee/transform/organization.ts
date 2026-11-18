import type { Organization } from '../../../schema/organization'

export interface GeeyeeOrganization {
  id?: string
  name?: string
  taxNo?: string
  [key: string]: unknown
}

export function transformOrganization(raw: GeeyeeOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    taxNumber: raw.taxNo || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
