import type { Organization } from '../../../schema/organization'

export interface PennylaneOrganization {
  id: string
  name: string
  legal_registration_number: string
  vat_number: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: PennylaneOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.vat_number || undefined,
    organizationCode: raw.legal_registration_number || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
