import type { Organization } from '../../../schema/organization'

export interface MoneyForwardMe {
  id: string
  name: string
  display_name: string | null
  email: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: MoneyForwardMe): Organization {
  return {
    name: raw.display_name || raw.name || undefined,
    legalName: raw.name || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
