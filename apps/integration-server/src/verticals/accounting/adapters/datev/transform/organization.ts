/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface DatevOrganization {
  id: string | number
  name: string
  legal_name: string
  tax_number: string
  street: string
  zip_code: string
  city: string
  country_code: string
  currency_code: string
  email: string
  phone: string
  [key: string]: unknown
}

export function transformOrganization(raw: DatevOrganization): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency_code || undefined,
    address: {
      address1: raw.street || undefined,
      postalCode: raw.zip_code || undefined,
      city: raw.city || undefined,
      country: raw.country_code || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
