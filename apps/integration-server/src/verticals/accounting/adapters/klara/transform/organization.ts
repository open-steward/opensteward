/**
 * KLARA company/organization transform.
 *
 * The KLARA company profile endpoint returns the authenticated company's info.
 */

import type { Organization } from '../../../schema/organization'

export interface KlaraCompany {
  id?: string
  name?: string
  legal_name?: string
  tax_number?: string
  uid?: string               // Swiss UID (Unternehmens-Identifikationsnummer)
  currency?: string
  timezone?: string
  website?: string
  address?: string
  zip?: string
  city?: string
  country?: string           // ISO 3166-1 alpha-2, typically "CH"
  fiscal_year_end_month?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformOrganization(raw: KlaraCompany): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.uid || raw.tax_number || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    fiscalYearEndMonth: raw.fiscal_year_end_month || undefined,
    address:
      raw.address || raw.city || raw.zip || raw.country
        ? {
            address1: raw.address || undefined,
            city: raw.city || undefined,
            postalCode: raw.zip || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
