import type { Organization } from '../../../schema/organization'

export interface BigcapitalOrgMetadata {
  id?: number
  tenantId?: number
  name?: string
  industry?: string
  location?: string
  baseCurrency?: string
  language?: string
  timezone?: string
  dateFormat?: string
  fiscalYear?: string
  taxNumber?: string
  address?: string
  [key: string]: unknown
}

export interface BigcapitalOrganization {
  id?: number
  organizationId?: string
  isReady?: boolean
  metadata?: BigcapitalOrgMetadata[]
  [key: string]: unknown
}

export function transformOrganization(raw: BigcapitalOrganization): Organization {
  // Bigcapital nests company data under a `metadata` array; use the first entry.
  const meta = Array.isArray(raw.metadata) ? raw.metadata[0] : undefined

  return {
    id: raw.organizationId || undefined,
    name: meta?.name || undefined,
    legalName: meta?.name || undefined,
    taxNumber: meta?.taxNumber || undefined,
    currency: meta?.baseCurrency || undefined,
    timezone: meta?.timezone || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
