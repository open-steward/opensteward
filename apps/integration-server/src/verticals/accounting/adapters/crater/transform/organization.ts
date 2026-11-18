/**
 * Crater business → canonical Organization.
 *
 * Crater exposes GET /api/v1/businesses/{id} for a specific business and
 * GET /api/v1/businesses for a paginated list.  The business object is the
 * same shape as a CraterContactBusiness but represents the authenticated
 * user's own company rather than a counterparty.
 */
import type { Organization } from '../../../schema/organization'

// ── Crater wire type ──────────────────────────────────────────────────────────

export interface CraterBusiness {
  id: string
  name: string
  email?: string
  phone?: string
  website?: string
  time_zone?: string
  billing_address?: {
    street_1?: string
    street_2?: string
    city?: string
    state?: string
    zip?: string
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: CraterBusiness): Organization {
  const ba = raw.billing_address
  const address = ba
    ? {
        address1: ba.street_1 || undefined,
        address2: ba.street_2 || undefined,
        city: ba.city || undefined,
        region: ba.state || undefined,
        postalCode: ba.zip || undefined,
      }
    : undefined

  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    timezone: raw.time_zone || undefined,
    website: raw.website || undefined,
    address: address && Object.values(address).some(Boolean) ? address : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
