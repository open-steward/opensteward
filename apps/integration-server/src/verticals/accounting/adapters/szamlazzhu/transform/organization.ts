/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Organization } from '../../../schema/organization'

export interface SzamlazzhuOrganization {
  id: string | number
  companyName: string
  taxNumber?: string
  [key: string]: unknown
}

export function transformOrganization(raw: SzamlazzhuOrganization): Organization {
  return {
    name: raw.companyName || undefined,
    legalName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
