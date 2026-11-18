import type { Organization } from '../../../schema/organization'

export interface DualentryCompanyAddress {
  street: string | null
  second_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

export interface DualentryCompany {
  id: number
  name: string
  parent_company_id: number | null
  currency_iso_4217_code: string | null
  address: DualentryCompanyAddress | null
  tin: string | null
  tin_type: string | null
  is_active: boolean
  fiscal_year_end_month: number | null
  [key: string]: unknown
}

export function transformOrganization(raw: DualentryCompany): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tin || undefined,
    currency: raw.currency_iso_4217_code || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month ?? undefined,
    parentId: raw.parent_company_id != null ? String(raw.parent_company_id) : undefined,
    address: raw.address
      ? {
          address1: raw.address.street || undefined,
          address2: raw.address.second_line || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.postal_code || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
