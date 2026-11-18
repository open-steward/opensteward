/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Organization } from '../../../schema/organization'

export interface DebitoorOrganization {
  companyName: string
  legalName: string
  taxNumber: string
  currency: string
  website: string
  address: string
  city: string
  zipCode: string
  countryCode: string
  [key: string]: unknown
}

export function transformOrganization(raw: DebitoorOrganization): Organization {
  return {
    name: raw.companyName || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zipCode || undefined,
      country: raw.countryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
