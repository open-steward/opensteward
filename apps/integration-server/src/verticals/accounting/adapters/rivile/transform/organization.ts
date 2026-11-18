import type { Organization } from '../../../schema/organization'

export interface RivileOrganization {
  id: string | number
  name: string
  pvm_kodas?: string
  [key: string]: unknown
}

export function transformOrganization(raw: RivileOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.pvm_kodas || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
