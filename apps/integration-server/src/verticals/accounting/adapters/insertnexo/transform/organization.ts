/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface InsertnexoOrganization {
  Id: string | number
  Nazwa?: string
  NazwaPrawna?: string
  NIP?: string
  Waluta?: string
  Email?: string
  [key: string]: unknown
}

export function transformOrganization(raw: InsertnexoOrganization): Organization {
  return {
    id: String(raw.Id),
    name: raw.Nazwa || undefined,
    legalName: raw.NazwaPrawna || undefined,
    taxNumber: raw.NIP || undefined,
    currency: raw.Waluta || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
