import type { Organization } from '../../../schema/organization'

export interface KoraBusiness {
  business_name?: string
  business_email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KoraBusiness): Organization {
  return {
    name: raw.business_name || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
