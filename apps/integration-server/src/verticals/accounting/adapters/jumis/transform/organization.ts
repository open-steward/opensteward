import type { Organization } from '../../../schema/organization'

export interface JumisOrganization {
  id: string | number
  name: string
  reg_nr?: string
  [key: string]: unknown
}

export function transformOrganization(raw: JumisOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.reg_nr || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
