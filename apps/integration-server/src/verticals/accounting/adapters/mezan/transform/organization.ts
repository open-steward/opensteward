import type { Organization } from '../../../schema/organization'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanOrganization {
  id?: string
  name?: string
  legal_name?: string
  tax_number?: string          // Saudi VAT registration number
  cr_number?: string           // Commercial registration number
  currency?: string
  timezone?: string
  country?: string
  city?: string
  address?: string
  zipcode?: string
  website?: string
  fiscal_year_end_month?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: MezanOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    organizationCode: raw.cr_number || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month || undefined,
    address:
      raw.address || raw.city || raw.country
        ? {
            address1: raw.address || undefined,
            city: raw.city || undefined,
            postalCode: raw.zipcode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
