import type { Organization } from '../../../schema/organization'

export interface SberbusinessOrganization {
  organizationId?: string
  organizationName?: string
  inn?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SberbusinessOrganization): Organization {
  return {
    id: raw.organizationId ? String(raw.organizationId) : '',
    name: raw.organizationName || undefined,
    taxNumber: raw.inn || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
