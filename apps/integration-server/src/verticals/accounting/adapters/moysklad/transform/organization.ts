import type { Organization } from '../../../schema/organization'

export interface MoyskladOrganization {
  id?: string
  name?: string
  inn?: string
  legalAddress?: {
    city?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformOrganization(raw: MoyskladOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    taxNumber: raw.inn || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
