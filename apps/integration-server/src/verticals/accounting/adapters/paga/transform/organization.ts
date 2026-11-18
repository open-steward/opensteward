import type { Organization } from '../../../schema/organization'

export interface PagaBusiness {
  businessName?: string
  businessEmail?: string
  [key: string]: unknown
}

export function transformOrganization(raw: PagaBusiness): Organization {
  return {
    name: raw.businessName || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
