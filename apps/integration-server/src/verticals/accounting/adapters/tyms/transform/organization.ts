import type { Organization } from '../../../schema/organization'

// ── Tyms wire type ─────────────────────────────────────────────────────────────

export interface TymsBusiness {
  uuid?: string
  id?: string
  name?: string
  legal_name?: string
  tax_number?: string
  currency?: string
  timezone?: string
  website?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  phone?: string
  email?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformOrganization(raw: TymsBusiness): Organization {
  const id = raw.uuid ?? raw.id

  return {
    id: id || undefined,
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: (raw.address || raw.city || raw.country)
      ? {
          address1: raw.address || undefined,
          city: raw.city || undefined,
          region: raw.state || undefined,
          postalCode: raw.postal_code || undefined,
          country: raw.country || undefined,
        }
      : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
