import type { Organization } from '../../../schema/organization'

export interface FreeeCompany {
  id: number
  display_name: string
  name: string
  phone1: string
  country_code: string
  default_wallet_account_id: number | null
  [key: string]: unknown
}

export function transformOrganization(raw: FreeeCompany): Organization {
  return {
    name: raw.display_name || raw.name || undefined,
    legalName: raw.name || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
