/**
 * Transform Routable workspace/team settings → canonical Organization.
 *
 * Routable does not expose a dedicated "organization" endpoint; the workspace
 * metadata is fetched from the team-members "me" context or can be inferred
 * from the authenticated account. We map whatever fields are available.
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Routable types ────────────────────────────────────────────────────────────

export interface RoutableWorkspace {
  id?: string
  name?: string
  legal_name?: string
  email?: string
  timezone?: string
  address?: {
    street_address?: string
    street_address2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: RoutableWorkspace): Organization {
  const addr = raw.address
  const address = addr
    ? toAddress({
        address1: addr.street_address,
        address2: addr.street_address2,
        city: addr.city,
        region: addr.state,
        postalCode: addr.postal_code,
        country: addr.country,
      })
    : undefined

  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.legal_name || raw.name || undefined,
    timezone: raw.timezone || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
