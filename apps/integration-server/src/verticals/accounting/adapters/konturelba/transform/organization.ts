import type { Organization } from '../../../schema/organization'

export interface KonturelbaOrganization {
  id?: string
  name?: string
  inn?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KonturelbaOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    taxNumber: raw.inn || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
