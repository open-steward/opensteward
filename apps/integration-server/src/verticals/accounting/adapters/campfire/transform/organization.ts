import type { Organization } from '../../../schema/organization'

export interface CampfireEntity {
  id: number
  name?: string | null
  description?: string | null
  currency?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  tax_identification_number?: string | null
  fiscal_year_month?: number | null
  active?: boolean | null
  logo_url?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: CampfireEntity): Organization {
  const hasAddress = raw.address_1 || raw.city || raw.country
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_identification_number || undefined,
    currency: raw.currency || undefined,
    fiscalYearEndMonth: raw.fiscal_year_month ?? undefined,
    address: hasAddress
      ? {
          address1: raw.address_1 || undefined,
          address2: raw.address_2 || undefined,
          city: raw.city || undefined,
          region: raw.state || undefined,
          postalCode: raw.zip_code || undefined,
          country: raw.country || undefined,
        }
      : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
