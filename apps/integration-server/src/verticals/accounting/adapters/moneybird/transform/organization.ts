import type { Organization } from '../../../schema/organization'

export interface MoneybirdAdmin {
  id?: number | string
  name?: string
  language?: string
  currency?: string
  country?: string
  time_zone?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MoneybirdAdmin): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    currency: raw.currency || undefined,
    timezone: raw.time_zone || undefined,
    address: raw.country ? { country: raw.country } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
