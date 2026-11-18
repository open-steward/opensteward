import type { Organization } from '../../../schema/organization'

export interface DilovodOrganization {
  id: string
  name: string
  edrpou?: string
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: DilovodOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.edrpou || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
