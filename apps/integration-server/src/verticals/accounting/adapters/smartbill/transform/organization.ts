import type { Organization } from '../../../schema/organization'

export interface SmartbillOrganization {
  id: string | number
  name: string
  cif?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SmartbillOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.cif || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
