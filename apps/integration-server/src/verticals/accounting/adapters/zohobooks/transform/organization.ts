import type { Organization } from '../../../schema/organization'

export interface ZohoBooksOrganization {
  organization_id: string
  name: string
  contact_name: string
  email: string
  currency_code: string
  currency_symbol: string
  org_address: string
  website: string
  tax_id: string
  [key: string]: unknown
}

export function transformOrganization(raw: ZohoBooksOrganization): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.tax_id || undefined,
    currency: raw.currency_code || undefined,
    website: raw.website || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
