/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface ComarchoptimaOrganization {
  id: string | number
  nazwa_firmy?: string
  nazwa_prawna?: string
  nip?: string
  waluta?: string
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: ComarchoptimaOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.nazwa_firmy || undefined,
    legalName: raw.nazwa_prawna || undefined,
    taxNumber: raw.nip || undefined,
    currency: raw.waluta || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
