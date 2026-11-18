import type { Organization } from '../../../schema/organization'

export interface ErpNextCompany {
  name: string
  default_currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: ErpNextCompany): Organization {
  return {
    id: raw.name,
    name: raw.name || undefined,
    currency: raw.default_currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
