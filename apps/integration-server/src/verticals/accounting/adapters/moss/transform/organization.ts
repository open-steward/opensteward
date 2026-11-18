import type { Organization } from '../../../schema/organization'

// ── Moss Organisation ─────────────────────────────────────────────────────────
// Moss does not expose a dedicated /organization endpoint.
// The organisation object is assembled from the `organisationId` present on
// other resources (expenses, suppliers, etc.) plus the authenticated
// user context.

export interface MossOrganisation {
  id: string
  name?: string | null
  currency?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganisation(raw: MossOrganisation): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
