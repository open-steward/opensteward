import type { Organization } from '../../../schema/organization'

export interface MeritaktivaOrganization {
  Id: string | number
  Name: string
  RegCode?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MeritaktivaOrganization): Organization {
  return {
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.RegCode || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
