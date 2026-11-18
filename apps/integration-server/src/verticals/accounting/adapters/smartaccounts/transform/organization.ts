import type { Organization } from '../../../schema/organization'

export interface SmartaccountsOrganization {
  id: string | number
  name: string
  reg_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SmartaccountsOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.reg_code || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
