/**
 * Transform a Yooz Rising org unit record into a canonical Organization.
 *
 * Yooz refers to tenants / companies as "org units". The orgUnits endpoint
 * returns the company profile for the authenticated integration.
 */
import type { Organization } from '../../../schema/organization'

// ── Yooz org unit record ──────────────────────────────────────────────────────

export interface YoozOrgUnit {
  id?: string | number
  name?: string
  legalName?: string
  siret?: string
  vatNumber?: string
  currency?: string
  address?: string
  address2?: string
  city?: string
  zipCode?: string
  countryCode?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: YoozOrgUnit): Organization {
  const hasAddress =
    raw.address || raw.city || raw.zipCode || raw.countryCode

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || raw.legalName || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.siret || raw.vatNumber || undefined,
    currency: raw.currency || undefined,
    address: hasAddress
      ? {
          address1: raw.address || undefined,
          address2: raw.address2 || undefined,
          city: raw.city || undefined,
          postalCode: raw.zipCode || undefined,
          country: raw.countryCode || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
