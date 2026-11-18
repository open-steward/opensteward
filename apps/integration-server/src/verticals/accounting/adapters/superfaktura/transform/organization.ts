import type { Organization } from '../../../schema/organization'

export interface SuperfakturaOrganization {
  id: string | number
  name?: string
  business_name?: string
  ico?: string
  currency?: string
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SuperfakturaOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.business_name || undefined,
    taxNumber: raw.ico || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
