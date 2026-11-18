import type { Organization } from '../../../schema/organization'

export interface FinmapOrganization {
  id: string
  name: string
  inn?: string
  [key: string]: unknown
}

export function transformOrganization(raw: FinmapOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.inn || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
