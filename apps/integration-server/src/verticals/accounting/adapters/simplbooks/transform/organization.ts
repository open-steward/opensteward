import type { Organization } from '../../../schema/organization'

// SimplBooks company / settings response
export interface SimplbooksCompany {
  id?: number | null
  name?: string | null
  legal_name?: string | null
  reg_code?: string | null         // business registration number
  vat_number?: string | null
  currency?: string | null         // ISO 4217
  timezone?: string | null
  website?: string | null
  fiscal_year_end_month?: number | null  // 1–12
  address?: string | null
  city?: string | null
  postal_code?: string | null
  country?: string | null          // ISO 3166-1 alpha-2
  [key: string]: unknown
}

export function transformOrganization(raw: SimplbooksCompany): Organization {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    taxNumber: raw.vat_number || raw.reg_code || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month ?? undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postal_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
