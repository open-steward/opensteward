import type { Organization } from '../../../schema/organization'

export interface SageOrganization {
  id: string
  name?: string
  base_currency?: { id?: string }
  [key: string]: unknown
}

export function transformOrganization(raw: SageOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    currency: raw.base_currency?.id || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
