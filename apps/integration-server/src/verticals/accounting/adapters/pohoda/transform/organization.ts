/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface PohodaOrganization {
  id: string | number
  company?: string
  legalName?: string
  ico?: string
  currency?: string
  email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: PohodaOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.company || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.ico || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
