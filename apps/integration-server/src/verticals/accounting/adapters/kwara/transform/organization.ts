import type { Organization } from '../../../schema/organization'

export interface KwaraOrganisation {
  id: string
  name?: string
  currency?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KwaraOrganisation): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
