import type { Organization } from '../../../schema/organization'

export interface AbraflexiOrganization {
  id: string | number
  nazev?: string
  pravniForma?: string
  ic?: string
  mena?: string
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AbraflexiOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.nazev || undefined,
    legalName: raw.pravniForma || undefined,
    taxNumber: raw.ic || undefined,
    currency: raw.mena || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
