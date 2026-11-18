/**
 * Bind ERP → canonical Organization transform.
 *
 * Bind ERP exposes basic company/user profile info via GET /api/UserProfile.
 * The UserProfile model (SDK v1.2) does not expose a dedicated company
 * endpoint, so we derive the Organization from the UserProfile response.
 */

import type { Organization } from '../../../schema/organization'

// ── Raw Bind ERP type ────────────────────────────────────────────────────────

export interface BindUserProfile {
  ID?: string
  Name?: string
  Email?: string
  RFC?: string
  CompanyName?: string
  CompanyRFC?: string
  LocationID?: string
  LocationName?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrganization(raw: BindUserProfile): Organization {
  return {
    id: raw.ID || raw.LocationID || undefined,
    name: raw.CompanyName || raw.LocationName || raw.Name || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.CompanyRFC || raw.RFC || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
