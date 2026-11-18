/**
 * Directo does not expose a dedicated company-info endpoint in its REST API.
 * We derive Organization from the authenticated user context or the first
 * customer record with the company's own code.  The interface below models
 * the shape returned when filtering customers by a known company code or any
 * future `/v1/company` endpoint Directo may add.
 *
 * Practically, `getOrganization` calls GET /v1/customers?code=SELF or falls
 * back to a placeholder derived from the API key metadata.
 */
import type { Organization } from '../../../schema/organization'

// ── Directo wire type ─────────────────────────────────────────────────────────

export interface DirectoCompanyInfo {
  code?: string
  name?: string
  regno?: string       // company registration number
  vatregno?: string    // VAT registration number
  currency?: string
  address1?: string
  address2?: string
  address3?: string    // city in Estonian address format
  country?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformOrganization(raw: DirectoCompanyInfo): Organization {
  return {
    id: raw.code || undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.vatregno || raw.regno || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: raw.address1 || undefined,
      address2: raw.address2 || undefined,
      city: raw.address3 || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
